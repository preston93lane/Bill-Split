// Shared bills ("tabs"): the host uploads the bill once, then each friend
// opens the link on their own phone, picks their name and checks what they
// ordered. Everyone's phone polls GET /api/tab for the latest state.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getTabStore, type TabStore } from "./tabStore.js";

const MAX_PEOPLE = 30;

const IdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const NameSchema = z.string().trim().min(1).max(40);

const BillSchema = z.object({
  merchant: z.string().max(120).nullable(),
  currency: z.string().max(8).nullable(),
  items: z
    .array(
      z.object({
        id: IdSchema,
        name: z.string().max(200),
        priceCents: z.number().int().min(-10_000_000).max(10_000_000),
        shared: z.boolean(),
      }),
    )
    .max(300),
  taxCents: z.number().int(),
  tipCents: z.number().int(),
  feesCents: z.number().int(),
  printedSubtotalCents: z.number().int().nullable(),
  printedTotalCents: z.number().int().nullable(),
});

const PersonSchema = z.object({
  id: IdSchema,
  name: NameSchema,
  color: z.number().int().min(0).max(7),
});

const SharedPersonSchema = PersonSchema.extend({
  joined: z.boolean().optional(),
  done: z.boolean().optional(),
});

const MetaFields = {
  bill: BillSchema,
  payerId: IdSchema.nullable(),
  venmo: z.string().max(40),
};

const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    ...MetaFields,
    people: z.array(PersonSchema).max(MAX_PEOPLE),
    claims: z.record(IdSchema, z.array(IdSchema)),
  }),
  z.object({
    // The host's phone putting back a bill that expired, under the same link.
    action: z.literal("restore"),
    id: IdSchema,
    hostKey: z.string().min(16),
    ...MetaFields,
    people: z.array(SharedPersonSchema).max(MAX_PEOPLE),
    claims: z.record(IdSchema, z.array(IdSchema)),
  }),
  z.object({ action: z.literal("setMeta"), id: IdSchema, hostKey: z.string(), ...MetaFields }),
  z.object({
    action: z.literal("addPerson"),
    id: IdSchema,
    person: PersonSchema.partial({ id: true, color: true }),
    /** Joining from your own phone (vs. the host adding a name). */
    joined: z.boolean(),
  }),
  z.object({ action: z.literal("join"), id: IdSchema, personId: IdSchema }),
  z.object({
    action: z.literal("rename"),
    id: IdSchema,
    hostKey: z.string(),
    personId: IdSchema,
    name: NameSchema,
  }),
  z.object({ action: z.literal("remove"), id: IdSchema, hostKey: z.string(), personId: IdSchema }),
  z.object({
    action: z.literal("claim"),
    id: IdSchema,
    personId: IdSchema,
    itemId: IdSchema,
    on: z.boolean(),
  }),
  z.object({ action: z.literal("done"), id: IdSchema, personId: IdSchema, done: z.boolean() }),
]);

interface StoredMeta {
  bill: z.infer<typeof BillSchema>;
  payerId: string | null;
  venmo: string;
  hostKeyHash: string;
  createdAt: number;
}

export interface SharedPerson {
  id: string;
  name: string;
  color: number;
  /** Opened the link and picked this name on their own phone. */
  joined: boolean;
  /** Tapped "I'm done". */
  done: boolean;
  order: number;
}

export interface TabSnapshot {
  id: string;
  bill: z.infer<typeof BillSchema>;
  payerId: string | null;
  venmo: string;
  people: SharedPerson[];
  claims: Record<string, string[]>;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const hash = (key: string) => createHash("sha256").update(key).digest("hex");
const randomId = (bytes: number) => randomBytes(bytes).toString("base64url");
const claimField = (itemId: string, personId: string) => `${itemId}|${personId}`;

function checkHost(meta: StoredMeta, hostKey: string) {
  const a = Buffer.from(meta.hostKeyHash);
  const b = Buffer.from(hash(hostKey));
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new HttpError(403, "Only the person who shared this bill can do that.");
  }
}

async function load(store: TabStore, id: string) {
  const data = await store.read(id);
  if (!data.meta) throw new HttpError(404, "This bill link has expired or doesn't exist.");
  const meta = JSON.parse(data.meta) as StoredMeta;
  const people = Object.values(data.people)
    .map((p) => JSON.parse(p) as SharedPerson)
    .sort((a, b) => a.order - b.order);
  const claims: Record<string, string[]> = {};
  for (const field of data.claims) {
    const [itemId, personId] = field.split("|");
    if (!itemId || !personId) continue;
    (claims[itemId] ??= []).push(personId);
  }
  return { meta, people, claims, rawClaims: data.claims };
}

function snapshot(id: string, loaded: Awaited<ReturnType<typeof load>>): TabSnapshot {
  const { meta, people, claims } = loaded;
  return { id, bill: meta.bill, payerId: meta.payerId, venmo: meta.venmo, people, claims };
}

function pickColor(people: SharedPerson[]): number {
  const used = new Set(people.map((p) => p.color));
  for (let c = 0; c < 8; c++) if (!used.has(c)) return c;
  return people.length % 8;
}

async function handle(store: TabStore, body: z.infer<typeof Body>): Promise<unknown> {
  switch (body.action) {
    case "create": {
      const id = randomId(8);
      const hostKey = randomId(24);
      const meta: StoredMeta = {
        bill: body.bill,
        payerId: body.payerId,
        venmo: body.venmo,
        hostKeyHash: hash(hostKey),
        createdAt: Date.now(),
      };
      await store.setMeta(id, JSON.stringify(meta));
      let order = Date.now();
      for (const p of body.people) {
        const person: SharedPerson = { ...p, joined: false, done: false, order: order++ };
        await store.setPerson(id, p.id, JSON.stringify(person));
      }
      for (const [itemId, personIds] of Object.entries(body.claims)) {
        for (const personId of personIds) await store.addClaim(id, claimField(itemId, personId));
      }
      return { id, hostKey };
    }

    case "restore": {
      const existing = await store.read(body.id);
      if (existing.meta) {
        checkHost(JSON.parse(existing.meta) as StoredMeta, body.hostKey);
        return { restored: false };
      }
      const meta: StoredMeta = {
        bill: body.bill,
        payerId: body.payerId,
        venmo: body.venmo,
        hostKeyHash: hash(body.hostKey),
        createdAt: Date.now(),
      };
      await store.setMeta(body.id, JSON.stringify(meta));
      let order = Date.now();
      for (const p of body.people) {
        const person: SharedPerson = {
          id: p.id,
          name: p.name,
          color: p.color,
          joined: p.joined ?? false,
          done: p.done ?? false,
          order: order++,
        };
        await store.setPerson(body.id, p.id, JSON.stringify(person));
      }
      for (const [itemId, personIds] of Object.entries(body.claims)) {
        for (const personId of personIds) await store.addClaim(body.id, claimField(itemId, personId));
      }
      return { restored: true };
    }

    case "setMeta": {
      const loaded = await load(store, body.id);
      checkHost(loaded.meta, body.hostKey);
      const meta: StoredMeta = { ...loaded.meta, bill: body.bill, payerId: body.payerId, venmo: body.venmo };
      await store.setMeta(body.id, JSON.stringify(meta));
      return { ok: true };
    }

    case "addPerson": {
      const loaded = await load(store, body.id);
      if (loaded.people.length >= MAX_PEOPLE) throw new HttpError(400, "That's a lot of people!");
      const person: SharedPerson = {
        id: body.person.id ?? randomId(9),
        name: body.person.name,
        color: body.person.color ?? pickColor(loaded.people),
        joined: body.joined,
        done: false,
        order: Date.now(),
      };
      await store.setPerson(body.id, person.id, JSON.stringify(person));
      return { person };
    }

    case "join":
    case "done": {
      const loaded = await load(store, body.id);
      const person = loaded.people.find((p) => p.id === body.personId);
      if (!person) throw new HttpError(404, "That name was removed from the bill.");
      const updated =
        body.action === "join" ? { ...person, joined: true } : { ...person, done: body.done };
      await store.setPerson(body.id, person.id, JSON.stringify(updated));
      return { person: updated };
    }

    case "rename": {
      const loaded = await load(store, body.id);
      checkHost(loaded.meta, body.hostKey);
      const person = loaded.people.find((p) => p.id === body.personId);
      if (!person) return { ok: true };
      await store.setPerson(body.id, person.id, JSON.stringify({ ...person, name: body.name }));
      return { ok: true };
    }

    case "remove": {
      const loaded = await load(store, body.id);
      checkHost(loaded.meta, body.hostKey);
      await store.deletePerson(body.id, body.personId);
      await store.removeClaims(
        body.id,
        loaded.rawClaims.filter((f) => f.endsWith(`|${body.personId}`)),
      );
      return { ok: true };
    }

    case "claim": {
      const field = claimField(body.itemId, body.personId);
      if (body.on) {
        await load(store, body.id); // make sure the bill still exists
        await store.addClaim(body.id, field);
      } else {
        await store.removeClaims(body.id, [field]);
      }
      return { ok: true };
    }
  }
}

/** Web-standard handler shared by the Vercel function and the Vite dev server. */
export async function handleTab(request: Request): Promise<Response> {
  const store = getTabStore();
  if (!store) {
    return Response.json(
      { error: "Sharing isn't set up yet: connect an Upstash Redis database in Vercel." },
      { status: 503 },
    );
  }
  try {
    if (request.method === "GET") {
      const id = IdSchema.safeParse(new URL(request.url).searchParams.get("id"));
      if (!id.success) throw new HttpError(400, "Missing bill id.");
      const loaded = await load(store, id.data);
      // Polls don't extend the 90 days (to save database calls); opening it does.
      if (new URL(request.url).searchParams.has("open")) await store.touch(id.data);
      return Response.json(snapshot(id.data, loaded), {
        headers: { "Cache-Control": "no-store" },
      });
    }
    if (request.method !== "POST") throw new HttpError(405, "Use GET or POST.");
    let json: unknown;
    try {
      json = await request.json();
    } catch {
      throw new HttpError(400, "Expected a JSON body.");
    }
    const body = Body.safeParse(json);
    if (!body.success) throw new HttpError(400, "That request didn't look right.");
    return Response.json(await handle(store, body.data));
  } catch (error) {
    if (error instanceof HttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("tab request failed", error);
    return Response.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}

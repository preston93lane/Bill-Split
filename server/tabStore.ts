// Where shared bills live. In production this is Upstash Redis (free tier,
// connected through Vercel's Storage tab). For local development without a
// database it falls back to memory, which is lost when the server restarts.
//
// Each shared bill ("tab") uses three keys so that friends claiming at the
// same moment never overwrite each other:
//   tab:<id>:meta    the bill itself, payer and Venmo name (only the host writes it)
//   tab:<id>:people  hash personId -> person JSON
//   tab:<id>:claims  hash "<itemId>|<personId>" -> "1"

import { Redis } from "@upstash/redis";

// A shared bill is kept until nobody has opened or changed it for 90 days.
// Even after that, the host's phone still has a full copy and quietly puts
// it back (same link) the next time the host opens the app.
export const TAB_TTL_SECONDS = 60 * 60 * 24 * 90;

export interface TabData {
  meta: string | null;
  people: Record<string, string>;
  claims: string[];
}

export interface TabStore {
  read(id: string): Promise<TabData>;
  setMeta(id: string, json: string): Promise<void>;
  setPerson(id: string, personId: string, json: string): Promise<void>;
  deletePerson(id: string, personId: string): Promise<void>;
  addClaim(id: string, field: string): Promise<void>;
  removeClaims(id: string, fields: string[]): Promise<void>;
  /** Resets the 90-day clock (called when someone opens the bill). */
  touch(id: string): Promise<void>;
}

const keys = (id: string) => ({
  meta: `tab:${id}:meta`,
  people: `tab:${id}:people`,
  claims: `tab:${id}:claims`,
});

class RedisStore implements TabStore {
  constructor(private redis: Redis) {}

  /** Every write (and every fresh open) pushes the expiry back. */
  async touch(id: string) {
    const k = keys(id);
    const p = this.redis.pipeline();
    p.expire(k.meta, TAB_TTL_SECONDS);
    p.expire(k.people, TAB_TTL_SECONDS);
    p.expire(k.claims, TAB_TTL_SECONDS);
    await p.exec();
  }

  async read(id: string): Promise<TabData> {
    const k = keys(id);
    const p = this.redis.pipeline();
    p.get<string>(k.meta);
    p.hgetall<Record<string, string>>(k.people);
    p.hkeys(k.claims);
    const [meta, people, claims] = (await p.exec()) as [
      string | null,
      Record<string, string> | null,
      string[] | null,
    ];
    return { meta, people: people ?? {}, claims: claims ?? [] };
  }

  async setMeta(id: string, json: string) {
    await this.redis.set(keys(id).meta, json, { ex: TAB_TTL_SECONDS });
    await this.touch(id);
  }

  async setPerson(id: string, personId: string, json: string) {
    await this.redis.hset(keys(id).people, { [personId]: json });
    await this.touch(id);
  }

  async deletePerson(id: string, personId: string) {
    await this.redis.hdel(keys(id).people, personId);
  }

  async addClaim(id: string, field: string) {
    await this.redis.hset(keys(id).claims, { [field]: "1" });
    await this.touch(id);
  }

  async removeClaims(id: string, fields: string[]) {
    if (fields.length) await this.redis.hdel(keys(id).claims, ...fields);
  }
}

class MemoryStore implements TabStore {
  private meta = new Map<string, string>();
  private people = new Map<string, Map<string, string>>();
  private claims = new Map<string, Set<string>>();

  async read(id: string): Promise<TabData> {
    return {
      meta: this.meta.get(id) ?? null,
      people: Object.fromEntries(this.people.get(id) ?? []),
      claims: [...(this.claims.get(id) ?? [])],
    };
  }
  async setMeta(id: string, json: string) {
    this.meta.set(id, json);
  }
  async setPerson(id: string, personId: string, json: string) {
    if (!this.people.has(id)) this.people.set(id, new Map());
    this.people.get(id)!.set(personId, json);
  }
  async deletePerson(id: string, personId: string) {
    this.people.get(id)?.delete(personId);
  }
  async addClaim(id: string, field: string) {
    if (!this.claims.has(id)) this.claims.set(id, new Set());
    this.claims.get(id)!.add(field);
  }
  async removeClaims(id: string, fields: string[]) {
    for (const f of fields) this.claims.get(id)?.delete(f);
  }
  async touch() {}
}

let store: TabStore | null = null;

/** Returns null when sharing isn't set up (deployed without a database). */
export function getTabStore(): TabStore | null {
  if (store) return store;
  // Vercel's Upstash integration may name the variables either way.
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (url && token) {
    store = new RedisStore(new Redis({ url, token, automaticDeserialization: false }));
  } else if (!process.env.VERCEL) {
    store = new MemoryStore();
  }
  return store;
}

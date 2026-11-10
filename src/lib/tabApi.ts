// Talks to /api/tab, where shared bills live while friends claim their items.

import type { SharedPerson, TabSnapshot } from "../../server/tabs";
import type { Bill, Claims, Person } from "./types";

export type { SharedPerson, TabSnapshot };

async function call<T>(init?: RequestInit, query = ""): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/tab${query}`, {
      ...init,
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });
  } catch {
    throw new Error("Couldn't reach the server. Check your connection.");
  }
  let body: (T & { error?: string }) | null = null;
  try {
    body = (await response.json()) as T & { error?: string };
  } catch {
    // Not JSON: no /api function on this host.
  }
  if (!response.ok || !body) {
    throw new Error(body?.error ?? "Sharing isn't available on this server.");
  }
  return body;
}

const post = <T>(body: Record<string, unknown>) =>
  call<T>({ method: "POST", body: JSON.stringify(body) });

export const tabApi = {
  get: (id: string) => call<TabSnapshot>(undefined, `?id=${encodeURIComponent(id)}`),

  create: (bill: Bill, people: Person[], claims: Claims, payerId: string | null, venmo: string) =>
    post<{ id: string; hostKey: string }>({
      action: "create",
      bill,
      people: people.map(({ id, name, color }) => ({ id, name, color })),
      claims,
      payerId,
      venmo,
    }),

  setMeta: (id: string, hostKey: string, bill: Bill, payerId: string | null, venmo: string) =>
    post({ action: "setMeta", id, hostKey, bill, payerId, venmo }),

  addPerson: (id: string, person: { id?: string; name: string; color?: number }, joined: boolean) =>
    post<{ person: SharedPerson }>({ action: "addPerson", id, person, joined }),

  join: (id: string, personId: string) => post<{ person: SharedPerson }>({ action: "join", id, personId }),

  rename: (id: string, hostKey: string, personId: string, name: string) =>
    post({ action: "rename", id, hostKey, personId, name }),

  remove: (id: string, hostKey: string, personId: string) =>
    post({ action: "remove", id, hostKey, personId }),

  claim: (id: string, personId: string, itemId: string, on: boolean) =>
    post({ action: "claim", id, personId, itemId, on }),

  done: (id: string, personId: string, done: boolean) => post({ action: "done", id, personId, done }),
};

export function tabLink(id: string): string {
  return `${window.location.origin}/?tab=${encodeURIComponent(id)}`;
}

/** Converts what the server sends into the app's own shapes. */
export function fromSnapshot(s: TabSnapshot): { people: Person[]; claims: Claims } {
  return {
    people: s.people.map(({ id, name, color, joined, done }) => ({ id, name, color, joined, done })),
    claims: s.claims,
  };
}

/** Shares via the phone's share sheet, falling back to copying. Returns how it went. */
export async function shareOrCopy(
  text: string,
): Promise<"shared" | "copied" | "cancelled" | "blocked" | "failed"> {
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ text });
      return "shared";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
      // Safari only opens the share sheet straight after a tap; a slow
      // network request in between uses that up.
      if (e instanceof DOMException && e.name === "NotAllowedError") return "blocked";
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}

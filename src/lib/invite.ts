// Messages the host sends: the first invite, a group reminder, and a nudge
// for one person. They go out through the phone's own share sheet (texts,
// group chats, DMs), so the app never needs anyone's phone number.

import { formatMoney } from "./money";
import { unclaimedItems } from "./split";
import type { Bill, Claims, Person } from "./types";

export type PersonStatus = "done" | "picking" | "byHost" | "waiting";

/**
 * done: tapped "I'm done" on their phone; picking: opened the link but isn't
 * done; byHost: never opened it, but the host checked items off for them
 * (usually the host themselves); waiting: hasn't opened it yet.
 */
export function statusOf(person: Person, claims: Claims): PersonStatus {
  if (person.done) return "done";
  if (person.joined) return "picking";
  const hasClaims = Object.values(claims).some((ids) => ids.includes(person.id));
  return hasClaims ? "byHost" : "waiting";
}

/** People a reminder is for: still picking, or haven't opened the link. */
export function needsReminder(person: Person, claims: Claims): boolean {
  const s = statusOf(person, claims);
  return s === "picking" || s === "waiting";
}

function place(bill: Bill): string {
  return bill.merchant ? ` from ${bill.merchant}` : "";
}

export function inviteText(bill: Bill, link: string): string {
  return [
    `🧾 Tap to check off what you ordered${place(bill)} so we can split the bill:`,
    link,
  ].join("\n");
}

export function reminderText(
  bill: Bill,
  people: Person[],
  claims: Claims,
  link: string,
  hostId: string | null,
): string {
  const unclaimed = unclaimedItems(bill, people, claims);
  const waiting = people.filter((p) => p.id !== hostId && needsReminder(p, claims));
  const lines = [`⏰ Reminder: check off what you ordered${place(bill)}`, link];
  if (waiting.length) lines.push("", `Still waiting on: ${waiting.map((p) => p.name).join(", ")}`);
  if (unclaimed.length) {
    const total = unclaimed.reduce((s, i) => s + i.priceCents, 0);
    lines.push(
      `${unclaimed.length} item${unclaimed.length === 1 ? "" : "s"} still unclaimed (${formatMoney(total)}): ${unclaimed
        .slice(0, 6)
        .map((i) => i.name)
        .join(", ")}${unclaimed.length > 6 ? ", …" : ""}`,
    );
  }
  return lines.join("\n");
}

export function nudgeText(bill: Bill, person: Person, link: string): string {
  return `Hey ${person.name}! Can you check off what you ordered${place(bill)}? Takes a few seconds:\n${link}`;
}

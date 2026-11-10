import { allocateProportionally, splitEvenly } from "./money";
import type { Bill, Claims, Item, Person } from "./types";

export interface ShareLine {
  item: Item;
  /** This person's part of the item's price. */
  cents: number;
  /** How many people the item is split between. */
  splitWays: number;
}

export interface PersonTotal {
  person: Person;
  lines: ShareLine[];
  itemsCents: number;
  taxCents: number;
  tipCents: number;
  feesCents: number;
  totalCents: number;
}

export interface SplitResult {
  people: PersonTotal[];
  unclaimed: Item[];
}

/** Who pays for an item: everyone for table dishes, otherwise its claimers. */
export function ownersOf(item: Item, people: Person[], claims: Claims): Person[] {
  if (item.shared) return people;
  const ids = new Set(claims[item.id] ?? []);
  return people.filter((p) => ids.has(p.id));
}

export function unclaimedItems(bill: Bill, people: Person[], claims: Claims): Item[] {
  return bill.items.filter((item) => ownersOf(item, people, claims).length === 0);
}

/**
 * Splits the bill:
 *  1. Each item is divided evenly between the people who claimed it (table
 *     dishes between everyone).
 *  2. Tax, tip and fees are divided in proportion to each person's share of
 *     the food, so whoever ordered more pays more of them.
 * Everything is in cents and every split sums exactly to what is owed.
 */
export function computeSplit(bill: Bill, people: Person[], claims: Claims): SplitResult {
  const lines = new Map<string, ShareLine[]>(people.map((p) => [p.id, []]));
  const unclaimed: Item[] = [];

  bill.items.forEach((item, itemIndex) => {
    const owners = ownersOf(item, people, claims);
    if (owners.length === 0) {
      unclaimed.push(item);
      return;
    }
    // Rotate who absorbs leftover pennies so it isn't always the same person.
    const parts = splitEvenly(item.priceCents, owners.length, itemIndex);
    owners.forEach((owner, i) => {
      lines.get(owner.id)?.push({ item, cents: parts[i] ?? 0, splitWays: owners.length });
    });
  });

  const itemsCents = people.map((p) =>
    (lines.get(p.id) ?? []).reduce((sum, line) => sum + line.cents, 0),
  );
  const tax = allocateProportionally(bill.taxCents, itemsCents);
  const tip = allocateProportionally(bill.tipCents, itemsCents);
  const fees = allocateProportionally(bill.feesCents, itemsCents);

  return {
    unclaimed,
    people: people.map((person, i) => {
      const items = itemsCents[i] ?? 0;
      const taxCents = tax[i] ?? 0;
      const tipCents = tip[i] ?? 0;
      const feesCents = fees[i] ?? 0;
      return {
        person,
        lines: lines.get(person.id) ?? [],
        itemsCents: items,
        taxCents,
        tipCents,
        feesCents,
        totalCents: items + taxCents + tipCents + feesCents,
      };
    }),
  };
}

/** "½", "⅓", "¼" … for showing a split item's share. */
export function shareLabel(splitWays: number): string {
  const glyphs: Record<number, string> = { 2: "½", 3: "⅓", 4: "¼", 5: "⅕", 6: "⅙", 8: "⅛" };
  return glyphs[splitWays] ?? `1/${splitWays}`;
}

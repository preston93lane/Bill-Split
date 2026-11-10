export interface Item {
  id: string;
  name: string;
  priceCents: number;
  /** Table dish (apps, shared bottles…): split evenly across everyone. */
  shared: boolean;
}

export interface Bill {
  merchant: string | null;
  currency: string | null;
  items: Item[];
  taxCents: number;
  tipCents: number;
  /** Service fees / surcharges (positive) or check-wide discounts (negative). */
  feesCents: number;
  /** Values printed on the receipt, kept only to sanity-check the scan. */
  printedSubtotalCents: number | null;
  printedTotalCents: number | null;
}

export interface Person {
  id: string;
  name: string;
  color: number;
  /** Shared bills only: opened the link and picked this name on their phone. */
  joined?: boolean;
  /** Shared bills only: tapped "I'm done". */
  done?: boolean;
}

/** itemId -> ids of the people who claimed it. */
export type Claims = Record<string, string[]>;

export type Step = "scan" | "review" | "split" | "results";

export interface AppState {
  step: Step;
  bill: Bill | null;
  people: Person[];
  claims: Claims;
  activePersonId: string | null;
  /** Who put the bill on their card; everyone else pays them back. */
  payerId: string | null;
  /** The payer's Venmo username, for pay links. */
  venmo: string;
  /** Set once the host shares the bill so friends can claim on their phones. */
  sharedTab: { id: string; hostKey: string } | null;
}

export const PERSON_COLORS = 8;

let idCounter = 0;
export function newId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

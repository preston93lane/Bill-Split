// All money in the app is handled as integer cents so splits always add up
// to the penny. Dollars only appear at the edges (parsing input, display).

export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

let currencyCode = "USD";

export function setCurrency(code: string | null | undefined): void {
  if (!code) return;
  try {
    new Intl.NumberFormat(undefined, { style: "currency", currency: code });
    currencyCode = code.toUpperCase();
  } catch {
    // Unknown currency code from the receipt: keep the previous one.
  }
}

export function formatMoney(cents: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currencyCode,
  }).format(cents / 100);
}

/** Plain "12.50" style string for editable inputs. */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Parses what a person typed ("$12.5", "1,200.00", "-3") into cents. */
export function parseMoneyInput(text: string): number | null {
  const cleaned = text.replace(/[^0-9.\-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return toCents(value);
}

/**
 * Splits `cents` into `n` near-equal integer parts. Leftover pennies go to
 * consecutive parts starting at `offset`, so callers can rotate who gets the
 * extra cent from item to item instead of always charging the same person.
 */
export function splitEvenly(cents: number, n: number, offset = 0): number[] {
  if (n <= 0) return [];
  const sign = cents < 0 ? -1 : 1;
  const abs = Math.abs(cents);
  const base = Math.floor(abs / n);
  const remainder = abs - base * n;
  const parts = new Array<number>(n).fill(base);
  for (let i = 0; i < remainder; i++) {
    const index = (offset + i) % n;
    parts[index] = (parts[index] ?? 0) + 1;
  }
  return parts.map((p) => p * sign);
}

/**
 * Splits `totalCents` across people in proportion to `weights` (each
 * person's share of the food), using the largest-remainder method so the
 * parts sum exactly to the total. Negative weights count as zero. If nobody
 * has a positive weight the total is split evenly.
 */
export function allocateProportionally(
  totalCents: number,
  weights: number[],
): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const clamped = weights.map((w) => Math.max(0, w));
  const weightSum = clamped.reduce((a, b) => a + b, 0);
  if (weightSum <= 0) return splitEvenly(totalCents, n);

  const sign = totalCents < 0 ? -1 : 1;
  const abs = Math.abs(totalCents);
  const exact = clamped.map((w) => (abs * w) / weightSum);
  const parts = exact.map((x) => Math.floor(x));
  let leftover = abs - parts.reduce((a, b) => a + b, 0);

  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (leftover <= 0) break;
    parts[i] = (parts[i] ?? 0) + 1;
    leftover--;
  }
  return parts.map((p) => p * sign);
}

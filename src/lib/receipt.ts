import type { ParsedReceipt } from "../../server/receiptSchema";
import { formatMoney, splitEvenly, toCents } from "./money";
import { newId, type Bill, type Item } from "./types";

const MAX_EXPANDED_QUANTITY = 20;

export function makeItem(name: string, priceCents: number, shared = false): Item {
  return { id: newId("item"), name, priceCents, shared };
}

export function emptyBill(): Bill {
  return {
    merchant: null,
    currency: null,
    items: [],
    taxCents: 0,
    tipCents: 0,
    feesCents: 0,
    printedSubtotalCents: null,
    printedTotalCents: null,
  };
}

/**
 * Turns Gemini's reading of the receipt into an editable bill. A line like
 * "3 Beer  $21.00" becomes three separate $7.00 beers so different people
 * can each claim one.
 */
export function billFromParsed(parsed: ParsedReceipt): Bill {
  const items: Item[] = [];
  for (const line of parsed.items) {
    const name = line.name.trim() || "Item";
    const totalCents = toCents(line.total_price);
    const qty = line.quantity;
    if (Number.isInteger(qty) && qty > 1 && qty <= MAX_EXPANDED_QUANTITY) {
      splitEvenly(totalCents, qty).forEach((unitCents, i) => {
        items.push(makeItem(`${name} (${i + 1}/${qty})`, unitCents));
      });
    } else {
      items.push(makeItem(name, totalCents));
    }
  }

  return {
    merchant: parsed.merchant?.trim() || null,
    currency: parsed.currency,
    items,
    taxCents: toCents(parsed.tax ?? 0),
    tipCents: toCents(parsed.tip ?? 0),
    feesCents: toCents(parsed.fees ?? 0),
    printedSubtotalCents: parsed.subtotal == null ? null : toCents(parsed.subtotal),
    printedTotalCents: parsed.total == null ? null : toCents(parsed.total),
  };
}

export function itemsTotal(bill: Bill): number {
  return bill.items.reduce((sum, item) => sum + item.priceCents, 0);
}

export function billTotal(bill: Bill): number {
  return itemsTotal(bill) + bill.taxCents + bill.tipCents + bill.feesCents;
}

/**
 * Compares the scanned items against the numbers printed on the receipt so a
 * misread or missing line gets noticed before anyone pays the wrong amount.
 */
export function checkBill(bill: Bill): string[] {
  const warnings: string[] = [];
  const items = itemsTotal(bill);

  if (bill.printedSubtotalCents != null && bill.printedSubtotalCents !== items) {
    warnings.push(
      `Items add up to ${formatMoney(items)}, but the receipt's subtotal is ${formatMoney(
        bill.printedSubtotalCents,
      )}. Check for a missing or misread item.`,
    );
  }

  if (bill.printedTotalCents != null) {
    const withTip = billTotal(bill);
    const beforeTip = withTip - bill.tipCents;
    // Receipts are often printed before the tip is added, so either matches.
    if (bill.printedTotalCents !== withTip && bill.printedTotalCents !== beforeTip) {
      warnings.push(
        `This bill comes to ${formatMoney(withTip)}${
          bill.tipCents ? ` (${formatMoney(beforeTip)} before tip)` : ""
        }, but the receipt's total is ${formatMoney(bill.printedTotalCents)}.`,
      );
    }
  }

  return warnings;
}

import { formatMoney } from "./money";
import { billTotal } from "./receipt";
import { shareLabel, type SplitResult } from "./split";
import type { Bill, Person } from "./types";
import { venmoNote, venmoPayLink } from "./venmo";

export interface ShareOptions {
  /** Who covered the bill; their line is marked and they get paid back. */
  payer?: Person | null;
  /** The payer's Venmo username, to add a pay link for everyone else. */
  venmo?: string;
  /** Item-by-item breakdown. Left out when an image of it is attached. */
  details?: boolean;
}

/** Plain-text summary that reads well in a text message or DM. */
export function buildShareText(bill: Bill, result: SplitResult, options: ShareOptions = {}): string {
  const { payer = null, venmo = "", details = true } = options;
  const title = bill.merchant ? `${bill.merchant} bill split` : "Bill split";
  const out: string[] = [`🧾 ${title}`, ""];

  for (const p of result.people) {
    const paid = payer?.id === p.person.id ? " (paid the bill)" : "";
    out.push(`${p.person.name}: ${formatMoney(p.totalCents)}${paid}`);
  }

  const extras = [
    bill.taxCents ? `${formatMoney(bill.taxCents)} tax` : null,
    bill.tipCents ? `${formatMoney(bill.tipCents)} tip` : null,
    bill.feesCents ? `${formatMoney(bill.feesCents)} fees` : null,
  ].filter(Boolean);
  out.push(
    "",
    `Total ${formatMoney(billTotal(bill))}${extras.length ? ` (incl. ${extras.join(" + ")})` : ""}`,
  );

  const owing = result.people.filter((p) => p.person.id !== payer?.id && p.totalCents > 0);
  if (payer && venmo && owing.length > 0) {
    out.push("", `Pay ${payer.name} on Venmo (@${venmo}):`);
    const note = venmoNote(bill.merchant);
    for (const p of owing) {
      out.push(`${p.person.name}: ${venmoPayLink(venmo, p.totalCents, note)}`);
    }
  } else if (payer && owing.length > 0) {
    out.push("", `Everyone pays back ${payer.name}.`);
  }

  if (!details) return out.join("\n");

  out.push("", "Details");
  for (const p of result.people) {
    out.push("", `${p.person.name} — ${formatMoney(p.totalCents)}`);
    for (const line of p.lines) {
      const share = line.item.shared
        ? ` (table, ${shareLabel(line.splitWays)})`
        : line.splitWays > 1
          ? ` (${shareLabel(line.splitWays)})`
          : "";
      out.push(`• ${line.item.name}${share} ${formatMoney(line.cents)}`);
    }
    const parts = [
      p.taxCents ? `tax ${formatMoney(p.taxCents)}` : null,
      p.tipCents ? `tip ${formatMoney(p.tipCents)}` : null,
      p.feesCents ? `fees ${formatMoney(p.feesCents)}` : null,
    ].filter(Boolean);
    if (parts.length) out.push(`+ ${parts.join(", ")}`);
  }

  return out.join("\n");
}

import type { CSSProperties } from "react";
import { formatMoney } from "../lib/money";
import { billTotal, itemsTotal } from "../lib/receipt";
import { buildShareText } from "../lib/share";
import { computeSplit, shareLabel } from "../lib/split";
import type { Bill, Claims, Person } from "../lib/types";
import { Avatar, Icon } from "./common";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API is unavailable on plain-http pages; use the legacy path.
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

function proportionalNote(bill: Bill): string {
  const parts = ["tax", bill.tipCents ? "tip" : null, bill.feesCents ? "fees" : null].filter(
    (p): p is string => p !== null,
  );
  const list =
    parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
  const sentence = `${list} ${parts.length === 1 ? "is" : "are"} split in proportion to what each person ordered.`;
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

export function ResultsStep({
  bill,
  people,
  claims,
  notify,
}: {
  bill: Bill;
  people: Person[];
  claims: Claims;
  notify: (message: string) => void;
}) {
  const split = computeSplit(bill, people, claims);
  const total = billTotal(bill);
  const assigned = split.people.reduce((sum, p) => sum + p.totalCents, 0);
  const text = buildShareText(bill, split);

  async function share() {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: bill.merchant ?? "Bill split", text });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    await copy();
  }

  async function copy() {
    notify((await copyText(text)) ? "Copied — paste it into your group chat" : "Couldn't copy");
  }

  return (
    <main className="page results">
      <section className="summary">
        <p className="summary-label">{bill.merchant ?? "Your bill"}</p>
        <p className="summary-total num">{formatMoney(total)}</p>
        <p className="summary-breakdown num">
          {formatMoney(itemsTotal(bill))} items
          {bill.taxCents !== 0 && <> · {formatMoney(bill.taxCents)} tax</>}
          {bill.tipCents !== 0 && <> · {formatMoney(bill.tipCents)} tip</>}
          {bill.feesCents !== 0 && <> · {formatMoney(bill.feesCents)} fees</>}
        </p>
        <div className="share-actions">
          <button type="button" className="btn btn-primary btn-lg" onClick={() => void share()}>
            <Icon name="share" /> Share with the group
          </button>
          <button type="button" className="btn btn-secondary btn-lg square" onClick={() => void copy()} aria-label="Copy summary">
            <Icon name="copy" />
          </button>
        </div>
      </section>

      <ul className="person-cards">
        {split.people.map((p) => (
          <li
            key={p.person.id}
            className="person-card"
            style={{ "--pc": `var(--p${p.person.color})` } as CSSProperties}
          >
            <div className="person-card-head">
              <Avatar person={p.person} size={36} />
              <span className="person-card-name">{p.person.name}</span>
              <span className="person-card-total num">{formatMoney(p.totalCents)}</span>
            </div>
            <ul className="person-lines">
              {p.lines.map((line) => (
                <li key={line.item.id}>
                  <span>
                    {line.item.name}
                    {line.item.shared ? (
                      <span className="tag tag-table">table · {shareLabel(line.splitWays)}</span>
                    ) : line.splitWays > 1 ? (
                      <span className="tag">{shareLabel(line.splitWays)}</span>
                    ) : null}
                  </span>
                  <span className="num">{formatMoney(line.cents)}</span>
                </li>
              ))}
              {p.lines.length === 0 && <li className="muted">No items</li>}
            </ul>
            <div className="person-extras num">
              <span>Items {formatMoney(p.itemsCents)}</span>
              {bill.taxCents !== 0 && <span>Tax {formatMoney(p.taxCents)}</span>}
              {bill.tipCents !== 0 && <span>Tip {formatMoney(p.tipCents)}</span>}
              {bill.feesCents !== 0 && <span>Fees {formatMoney(p.feesCents)}</span>}
            </div>
          </li>
        ))}
      </ul>

      <p className={`check-line ${assigned === total ? "ok" : "bad"}`}>
        <Icon name={assigned === total ? "check" : "warn"} size={16} />
        {assigned === total
          ? `Everyone's shares add up to ${formatMoney(total)}`
          : `Shares add up to ${formatMoney(assigned)} of ${formatMoney(total)}`}
      </p>
      <p className="fine-print">{proportionalNote(bill)}</p>
    </main>
  );
}

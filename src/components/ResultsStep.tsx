import { useEffect, useRef, useState, type CSSProperties } from "react";
import { formatMoney } from "../lib/money";
import { billTotal, itemsTotal } from "../lib/receipt";
import { buildShareText } from "../lib/share";
import { renderShareImage } from "../lib/shareImage";
import { computeSplit, shareLabel } from "../lib/split";
import type { Bill, Claims, Person } from "../lib/types";
import {
  cleanVenmoUsername,
  rememberVenmo,
  rememberedVenmo,
  venmoNote,
  venmoPayLink,
  venmoRequestLink,
} from "../lib/venmo";
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
  payerId,
  onSetPayer,
  venmo: venmoRaw,
  onVenmoChange,
  notify,
  viewerId,
}: {
  bill: Bill;
  people: Person[];
  claims: Claims;
  payerId: string | null;
  onSetPayer: (id: string | null) => void;
  venmo: string;
  onVenmoChange: (venmo: string) => void;
  notify: (message: string) => void;
  /** A friend viewing a shared bill: read-only, with their own total up top. */
  viewerId?: string;
}) {
  const split = computeSplit(bill, people, claims);
  const total = billTotal(bill);
  const assigned = split.people.reduce((sum, p) => sum + p.totalCents, 0);
  const payer = people.find((p) => p.id === payerId) ?? null;
  const [sharing, setSharing] = useState(false);
  const venmo = cleanVenmoUsername(venmoRaw);
  const note = venmoNote(bill.merchant);
  const readOnly = viewerId !== undefined;
  const viewer = split.people.find((p) => p.person.id === viewerId);
  const unclaimedCount = split.unclaimed.length;

  // When the payer changes, use their Venmo username from an earlier bill if
  // there is one; otherwise keep what's set (usually your own).
  const lastPayer = useRef(payer?.id);
  useEffect(() => {
    if (readOnly || lastPayer.current === payer?.id) return;
    lastPayer.current = payer?.id;
    const remembered = payer ? rememberedVenmo(payer.name) : "";
    if (remembered) onVenmoChange(remembered);
  }, [payer?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const fullText = () => buildShareText(bill, split, { payer, venmo });

  async function share() {
    setSharing(true);
    try {
      if (typeof navigator.share === "function") {
        // Preferred: the picture of everyone's totals, plus a short text with
        // the Venmo links (the details are already in the picture).
        try {
          const blob = await renderShareImage(bill, split, payer, venmo);
          const file = new File([blob], "bill-split.png", { type: "image/png" });
          const text = buildShareText(bill, split, { payer, venmo, details: false });
          if (navigator.canShare?.({ files: [file] })) {
            await navigator.share({ files: [file], text });
            return;
          }
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") return;
        }
        try {
          await navigator.share({ title: bill.merchant ?? "Bill split", text: fullText() });
          return;
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") return;
        }
      }
      await copy();
    } finally {
      setSharing(false);
    }
  }

  async function copy() {
    notify((await copyText(fullText())) ? "Copied — paste it into your group chat" : "Couldn't copy");
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
      </section>

      {readOnly && unclaimedCount > 0 && (
        <div className="callout callout-warn">
          <Icon name="warn" />
          <p>
            {unclaimedCount} item{unclaimedCount === 1 ? " is" : "s are"} still unclaimed, so these totals
            can still change.
          </p>
        </div>
      )}

      {readOnly && viewer && (
        <section className="card you-owe" style={{ "--pc": `var(--p${viewer.person.color})` } as CSSProperties}>
          {viewer.person.id === payerId ? (
            <p>
              <strong>You paid the bill.</strong> Everyone else pays you back.
            </p>
          ) : (
            <>
              <p className="you-owe-label">You owe{payer ? ` ${payer.name}` : ""}</p>
              <p className="you-owe-total num">{formatMoney(viewer.totalCents)}</p>
              {venmo && viewer.totalCents > 0 && unclaimedCount === 0 && (
                <a
                  className="btn btn-primary btn-lg venmo-pay"
                  href={venmoPayLink(venmo, viewer.totalCents, note)}
                >
                  Pay {payer ? payer.name : `@${venmo}`} on Venmo
                </a>
              )}
              {venmo && unclaimedCount > 0 && (
                <p className="muted small">The Venmo button appears once every item is claimed.</p>
              )}
            </>
          )}
        </section>
      )}

      {!readOnly && (
        <>
      <section className="card payer-card">
        <div className="card-head">
          <h2>Who paid the bill?</h2>
        </div>
        <div className="payer-chips" role="group" aria-label="Who paid the bill">
          {people.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`payer-chip ${p.id === payerId ? "is-on" : ""}`}
              style={{ "--pc": `var(--p${p.color})` } as CSSProperties}
              aria-pressed={p.id === payerId}
              onClick={() => onSetPayer(p.id === payerId ? null : p.id)}
            >
              <Avatar person={p} size={22} />
              {p.name}
            </button>
          ))}
        </div>
        {payer && (
          <label className="field venmo-field">
            <span className="field-label">{payer.name}'s Venmo username (optional)</span>
            <span className="venmo-input">
              <span aria-hidden="true">@</span>
              <input
                type="text"
                value={venmoRaw}
                placeholder="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                onChange={(e) => {
                  // The "@" is already shown in front, so drop any typed ones.
                  onVenmoChange(e.target.value.replace(/^\s*@+/, ""));
                  rememberVenmo(payer.name, cleanVenmoUsername(e.target.value));
                }}
              />
            </span>
            <span className="muted small">
              {venmo
                ? "Everyone gets a link that opens Venmo with their amount filled in."
                : "Add it to include a Venmo pay link for each person in the text."}
            </span>
          </label>
        )}
      </section>

      <div className="share-actions">
        <button type="button" className="btn btn-primary btn-lg" disabled={sharing} onClick={() => void share()}>
          <Icon name="share" /> {sharing ? "Getting it ready…" : "Share with the group"}
        </button>
        <button type="button" className="btn btn-secondary btn-lg square" onClick={() => void copy()} aria-label="Copy summary">
          <Icon name="copy" />
        </button>
      </div>
        </>
      )}

      <ul className="person-cards">
        {split.people.map((p) => {
          const isPayer = p.person.id === payerId;
          return (
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
              {isPayer ? (
                <p className="paid-note">
                  <Icon name="check" size={16} /> Paid the bill
                </p>
              ) : !readOnly && payer && p.totalCents > 0 ? (
                <a className="btn btn-secondary venmo-btn" href={venmoRequestLink(p.totalCents, note)}>
                  Request {formatMoney(p.totalCents)} on Venmo
                </a>
              ) : null}
            </li>
          );
        })}
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

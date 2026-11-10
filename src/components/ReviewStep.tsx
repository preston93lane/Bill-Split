import { useState } from "react";
import { formatMoney } from "../lib/money";
import { billTotal, checkBill, itemsTotal, makeItem } from "../lib/receipt";
import type { Bill, Item } from "../lib/types";
import { Icon, MoneyInput } from "./common";

const TIP_PRESETS = [15, 18, 20, 22];

export function ReviewStep({
  bill,
  onChange,
  onNext,
  photo,
  onViewPhoto,
}: {
  photo: string | null;
  onViewPhoto: () => void;
  bill: Bill;
  onChange: (bill: Bill) => void;
  onNext: () => void;
}) {
  const [focusItemId, setFocusItemId] = useState<string | null>(null);
  const subtotal = itemsTotal(bill);
  const warnings = checkBill(bill);
  const tipPercent = subtotal > 0 ? Math.round((bill.tipCents / subtotal) * 1000) / 10 : 0;

  const updateItem = (id: string, patch: Partial<Item>) =>
    onChange({ ...bill, items: bill.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) });

  function addItem() {
    const item = makeItem("", 0);
    setFocusItemId(item.id);
    onChange({ ...bill, items: [...bill.items, item] });
  }

  function next() {
    // Drop blank rows and give unnamed items a placeholder name.
    const items = bill.items
      .filter((i) => i.name.trim() !== "" || i.priceCents !== 0)
      .map((i, n) => (i.name.trim() ? i : { ...i, name: `Item ${n + 1}` }));
    onChange({ ...bill, items });
    onNext();
  }

  const realItems = bill.items.filter((i) => i.name.trim() !== "" || i.priceCents !== 0);

  return (
    <main className="page review">
      <p className="muted">Fix anything that was misread before you split it.</p>

      {photo && (
        <button type="button" className="photo-card" onClick={onViewPhoto}>
          <img src={photo} alt="" />
          <span>
            <strong>Receipt photo</strong>
            <span className="muted">Tap to compare against what was read</span>
          </span>
          <Icon name="image" />
        </button>
      )}

      <label className="field">
        <span className="field-label">Restaurant</span>
        <input
          type="text"
          value={bill.merchant ?? ""}
          placeholder="Optional"
          onChange={(e) => onChange({ ...bill, merchant: e.target.value || null })}
        />
      </label>

      <section className="card">
        <div className="card-head">
          <h2>Items</h2>
          <span className="muted">{bill.items.length}</span>
        </div>
        <ul className="edit-list">
          {bill.items.map((item, index) => (
            <li key={item.id} className="edit-row">
              <input
                type="text"
                className="edit-name"
                value={item.name}
                placeholder={`Item ${index + 1}`}
                aria-label={`Item ${index + 1} name`}
                autoFocus={item.id === focusItemId}
                onChange={(e) => updateItem(item.id, { name: e.target.value })}
              />
              <MoneyInput
                cents={item.priceCents}
                label={`${item.name || `Item ${index + 1}`} price`}
                onChange={(priceCents) => updateItem(item.id, { priceCents })}
              />
              <button
                type="button"
                className="icon-btn"
                aria-label={`Remove ${item.name || `item ${index + 1}`}`}
                onClick={() => onChange({ ...bill, items: bill.items.filter((i) => i.id !== item.id) })}
              >
                <Icon name="trash" size={18} />
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="btn btn-ghost add-item" onClick={addItem}>
          <Icon name="plus" size={18} /> Add item
        </button>
        <div className="sum-row">
          <span>Items subtotal</span>
          <span className="num">{formatMoney(subtotal)}</span>
        </div>
      </section>

      <section className="card">
        <div className="charge-row">
          <span className="charge-label">Tax</span>
          <MoneyInput cents={bill.taxCents} label="Tax" onChange={(taxCents) => onChange({ ...bill, taxCents })} />
        </div>

        <div className="charge-row">
          <span className="charge-label">
            Tip
            {bill.tipCents > 0 && subtotal > 0 && <small className="muted"> {tipPercent}%</small>}
          </span>
          <MoneyInput cents={bill.tipCents} label="Tip" onChange={(tipCents) => onChange({ ...bill, tipCents })} />
        </div>
        <div className="tip-presets" role="group" aria-label="Tip presets">
          {TIP_PRESETS.map((pct) => {
            const cents = Math.round((subtotal * pct) / 100);
            return (
              <button
                key={pct}
                type="button"
                className={`chip ${bill.tipCents === cents && cents > 0 ? "chip-on" : ""}`}
                onClick={() => onChange({ ...bill, tipCents: cents })}
              >
                {pct}%
              </button>
            );
          })}
        </div>

        <div className="charge-row">
          <span className="charge-label">
            Fees
            <small className="muted block">Service fees; negative for discounts</small>
          </span>
          <MoneyInput cents={bill.feesCents} label="Fees" onChange={(feesCents) => onChange({ ...bill, feesCents })} />
        </div>

        <div className="sum-row sum-total">
          <span>Total</span>
          <span className="num">{formatMoney(billTotal(bill))}</span>
        </div>
      </section>

      {warnings.map((w) => (
        <div key={w} className="callout callout-warn">
          <Icon name="warn" />
          <div>
            <p>{w}</p>
            {photo && (
              <button type="button" className="link-btn callout-link" onClick={onViewPhoto}>
                Check the receipt photo
              </button>
            )}
          </div>
        </div>
      ))}

      <footer className="action-bar">
        <button type="button" className="btn btn-primary btn-lg" disabled={realItems.length === 0} onClick={next}>
          Start splitting
        </button>
      </footer>
    </main>
  );
}

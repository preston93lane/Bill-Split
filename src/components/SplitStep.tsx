import { useState, type CSSProperties, type Dispatch, type FormEvent, type ReactNode } from "react";
import { formatMoney } from "../lib/money";
import { computeSplit, ownersOf, shareLabel } from "../lib/split";
import type { Bill, Claims, Item, Person } from "../lib/types";
import type { Action } from "../state";
import { Avatar, Icon, Modal } from "./common";

interface Props {
  bill: Bill;
  people: Person[];
  claims: Claims;
  activePersonId: string | null;
  dispatch: Dispatch<Action>;
  onDone: () => void;
  /**
   * A friend claiming on their own phone from a shared link: they only check
   * off their own items and can't add people or change table dishes.
   */
  guest?: boolean;
  /** Shown under the people bar (the host's live status for shared bills). */
  topSlot?: ReactNode;
}

export function SplitStep({
  bill,
  people,
  claims,
  activePersonId,
  dispatch,
  onDone,
  guest = false,
  topSlot,
}: Props) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Person | null>(null);
  const [showUnclaimed, setShowUnclaimed] = useState(false);

  const active = people.find((p) => p.id === activePersonId) ?? null;
  const split = computeSplit(bill, people, claims);
  const unclaimed = split.unclaimed;
  const claimedCount = bill.items.length - unclaimed.length;
  const activeTotal = split.people.find((p) => p.person.id === active?.id);

  function tryFinish() {
    if (guest) onDone();
    else if (unclaimed.length > 0) setShowUnclaimed(true);
    else onDone();
  }

  function onRowClick(item: Item) {
    if (item.shared) return;
    if (!active) setAdding(true);
    else dispatch({ type: "toggleClaim", itemId: item.id });
  }

  return (
    <main className="page split">
      <div className="people-bar" role="toolbar" aria-label="People splitting the bill">
        {!guest && (
          <button
            type="button"
            className={`add-person ${people.length === 0 ? "pulse" : ""}`}
            aria-label="Add a person"
            onClick={() => setAdding(true)}
          >
            <Icon name="plus" size={22} />
          </button>
        )}
        <div className="people-scroll">
          {people.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`person-chip ${p.id === active?.id ? "is-active" : ""}`}
              style={{ "--pc": `var(--p${p.color})` } as CSSProperties}
              aria-pressed={p.id === active?.id}
              disabled={guest && p.id !== active?.id}
              onClick={() => {
                if (guest) return;
                if (p.id === active?.id) setEditing(p);
                else dispatch({ type: "setActive", id: p.id });
              }}
            >
              <Avatar person={p} size={24} />
              <span className="person-name">{p.name}</span>
            </button>
          ))}
        </div>
      </div>

      {topSlot}

      {active ? (
        <div className="active-banner" style={{ "--pc": `var(--p${active.color})` } as CSSProperties}>
          <div>
            {guest ? (
              <>
                <span className="muted">Hi</span> <strong>{active.name}</strong>
                <span className="muted">! Check everything you ordered</span>
              </>
            ) : (
              <>
                <span className="muted">Check everything</span> <strong>{active.name}</strong>{" "}
                <span className="muted">ordered</span>
              </>
            )}
          </div>
          <div className="active-total num">
            {activeTotal?.lines.length ?? 0} items · {formatMoney(activeTotal?.itemsCents ?? 0)}
          </div>
          {!guest && (
            <button type="button" className="link-btn" onClick={() => setEditing(active)}>
              <Icon name="edit" size={14} /> Edit
            </button>
          )}
        </div>
      ) : (
        <div className="empty-people">
          <strong>Who's splitting?</strong>
          <p>
            Tap <span className="inline-plus">+</span> to add the first person, then check the items they
            ordered.
          </p>
        </div>
      )}

      <ul className="item-list">
        {bill.items.map((item) => {
          const owners = ownersOf(item, people, claims);
          const mine = !!active && !item.shared && (claims[item.id] ?? []).includes(active.id);
          return (
            <li
              key={item.id}
              className={`item-row ${mine ? "is-mine" : ""} ${item.shared ? "is-shared" : ""} ${
                owners.length === 0 ? "is-unclaimed" : ""
              }`}
            >
              <label className="item-main">
                <input
                  type="checkbox"
                  checked={mine || item.shared}
                  disabled={item.shared}
                  onChange={() => onRowClick(item)}
                  aria-label={item.name}
                />
                <span className="item-check" aria-hidden="true">
                  {item.shared ? <Icon name="table" size={16} /> : <Icon name="check" size={16} />}
                </span>
                <span className="item-text">
                  <span className="item-name">{item.name}</span>
                  <span className="item-owners">
                    {item.shared ? (
                      <span className="tag tag-table">
                        Table dish{people.length > 1 ? ` · split ${people.length} ways` : ""}
                      </span>
                    ) : owners.length === 0 ? (
                      <span className="tag tag-unclaimed">Unclaimed</span>
                    ) : (
                      <>
                        {owners.map((o) => (
                          <span key={o.id} className="owner" title={o.name}>
                            <Avatar person={o} size={18} />
                            <span>{o.name}</span>
                          </span>
                        ))}
                        {owners.length > 1 && (
                          <span className="muted small">{shareLabel(owners.length)} each</span>
                        )}
                      </>
                    )}
                  </span>
                </span>
              </label>
              <div className="item-side">
                <span className="item-price num">{formatMoney(item.priceCents)}</span>
{!guest && (
                <button
                  type="button"
                  className={`table-toggle ${item.shared ? "is-on" : ""}`}
                  aria-pressed={item.shared}
                  aria-label={`${item.shared ? "Unmark" : "Mark"} ${item.name} as a table dish`}
                  onClick={() => dispatch({ type: "setShared", itemIds: [item.id], shared: !item.shared })}
                >
                  <Icon name="table" size={14} /> Table
                </button>
)}
              </div>
            </li>
          );
        })}
      </ul>

      <footer className="action-bar">
        <div className="progress" aria-live="polite">
          <div className="progress-text">
            <span>
              <strong>{claimedCount}</strong> of {bill.items.length} items claimed
            </span>
            {unclaimed.length > 0 && people.length > 0 && (
              <span className="warn-text">{unclaimed.length} left</span>
            )}
          </div>
          <div className="progress-track">
            <div
              className="progress-fill"
              style={{ width: `${bill.items.length ? (claimedCount / bill.items.length) * 100 : 0}%` }}
            />
          </div>
        </div>
        <button type="button" className="btn btn-primary btn-lg" disabled={people.length === 0} onClick={tryFinish}>
          {guest ? "I'm done" : "See who owes what"}
        </button>
      </footer>

      {adding && (
        <PersonNameModal
          title={people.length === 0 ? "Who's first?" : "Add a person"}
          submitLabel="Add"
          onClose={() => setAdding(false)}
          onSubmit={(name) => {
            dispatch({ type: "addPerson", name });
            setAdding(false);
          }}
        />
      )}

      {editing && (
        <PersonNameModal
          title="Edit person"
          submitLabel="Save"
          initialName={editing.name}
          onClose={() => setEditing(null)}
          onSubmit={(name) => {
            dispatch({ type: "renamePerson", id: editing.id, name });
            setEditing(null);
          }}
          onRemove={() => {
            dispatch({ type: "removePerson", id: editing.id });
            setEditing(null);
          }}
        />
      )}

      {showUnclaimed && (
        <UnclaimedModal
          items={unclaimed}
          peopleCount={people.length}
          onClose={() => setShowUnclaimed(false)}
          onMakeTable={(ids) => dispatch({ type: "setShared", itemIds: ids, shared: true })}
          onContinue={() => {
            setShowUnclaimed(false);
            onDone();
          }}
        />
      )}
    </main>
  );
}

function PersonNameModal({
  title,
  submitLabel,
  initialName = "",
  onClose,
  onSubmit,
  onRemove,
}: {
  title: string;
  submitLabel: string;
  initialName?: string;
  onClose: () => void;
  onSubmit: (name: string) => void;
  onRemove?: () => void;
}) {
  const [name, setName] = useState(initialName);
  const trimmed = name.trim();

  function submit(e: FormEvent) {
    e.preventDefault();
    if (trimmed) onSubmit(trimmed);
  }

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit} className="modal-body">
        <input
          type="text"
          className="name-input"
          value={name}
          placeholder="Name"
          aria-label="Name"
          autoComplete="off"
          autoCapitalize="words"
          enterKeyHint="done"
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="modal-actions">
          {onRemove && (
            <button type="button" className="btn btn-danger-ghost" onClick={onRemove}>
              <Icon name="trash" size={18} /> Remove
            </button>
          )}
          <button type="submit" className="btn btn-primary" disabled={!trimmed}>
            {submitLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function UnclaimedModal({
  items,
  peopleCount,
  onClose,
  onMakeTable,
  onContinue,
}: {
  items: Item[];
  peopleCount: number;
  onClose: () => void;
  onMakeTable: (ids: string[]) => void;
  onContinue: () => void;
}) {
  const total = items.reduce((sum, i) => sum + i.priceCents, 0);

  if (items.length === 0) {
    return (
      <Modal title="Every item has an owner" onClose={onClose}>
        <div className="modal-body">
          <p className="muted">Nice — the whole bill is accounted for.</p>
          <div className="modal-actions">
            <button type="button" className="btn btn-primary" onClick={onContinue}>
              See who owes what
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  const n = items.length;
  return (
    <Modal title={`${n} ${n === 1 ? "item needs" : "items need"} an owner`} onClose={onClose} tone="warn">
      <div className="modal-body">
        <p className="muted">
          {formatMoney(total)} of the bill hasn't been claimed yet. Check these off for someone, or split
          them with the whole table.
        </p>
        <ul className="unclaimed-list">
          {items.map((item) => (
            <li key={item.id}>
              <span className="unclaimed-name">{item.name}</span>
              <span className="num">{formatMoney(item.priceCents)}</span>
              <button type="button" className="table-toggle" onClick={() => onMakeTable([item.id])}>
                <Icon name="table" size={14} /> Table
              </button>
            </li>
          ))}
        </ul>
        <div className="modal-actions stack">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              onMakeTable(items.map((i) => i.id));
              onContinue();
            }}
          >
            <Icon name="table" size={18} />
            {n === 1 ? "Split it" : `Split all ${n}`} with the table
            {peopleCount > 1 ? ` (${peopleCount} ways)` : ""}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Go back and assign
          </button>
        </div>
      </div>
    </Modal>
  );
}

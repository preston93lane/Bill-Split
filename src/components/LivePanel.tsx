import { useState, type CSSProperties } from "react";
import { needsReminder, nudgeText, reminderText, statusOf } from "../lib/invite";
import { shareOrCopy, tabLink } from "../lib/tabApi";
import { unclaimedItems } from "../lib/split";
import type { Bill, Claims, Person } from "../lib/types";
import { Avatar, Icon } from "./common";

const STATUS_LABEL = {
  done: "Done",
  picking: "Picking",
  byHost: "Checked by you",
  waiting: "Hasn't opened it",
} as const;

/**
 * The host's view of a shared bill: invite friends to claim on their own
 * phones, see who's done and what's still unclaimed, and send reminders.
 */
export function LivePanel({
  bill,
  people,
  claims,
  payerId,
  tabId,
  onInvite,
  notify,
}: {
  bill: Bill;
  people: Person[];
  claims: Claims;
  payerId: string | null;
  tabId: string | null;
  onInvite: () => Promise<void>;
  notify: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function invite() {
    setBusy(true);
    try {
      await onInvite();
    } finally {
      setBusy(false);
    }
  }

  async function send(text: string) {
    const result = await shareOrCopy(text);
    if (result === "copied") notify("Copied — paste it into a text");
    if (result === "failed") notify("Couldn't share");
  }

  if (!tabId) {
    return (
      <section className="live-card live-invite">
        <div>
          <strong>Let everyone claim on their phone</strong>
          <p className="muted small">
            Send a link. Friends tap their name and check off what they ordered. You'll see who's done.
          </p>
        </div>
        <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void invite()}>
          <Icon name="share" size={16} /> {busy ? "…" : "Send link"}
        </button>
      </section>
    );
  }

  const link = tabLink(tabId);
  const unclaimed = unclaimedItems(bill, people, claims);
  const statuses = people.map((p) => ({ person: p, status: statusOf(p, claims) }));
  // "Done" counts people the host finished for, too.
  const done = statuses.filter((s) => s.status === "done" || s.status === "byHost").length;
  const waiting = people.filter((p) => p.id !== payerId && needsReminder(p, claims));

  return (
    <section className="live-card">
      <button type="button" className="live-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="live-dot" aria-hidden="true" />
        <span className="live-summary">
          <strong>
            {done} of {people.length} done
          </strong>
          <span className={unclaimed.length ? "warn-text" : "ok-text"}>
            {unclaimed.length ? ` · ${unclaimed.length} item${unclaimed.length === 1 ? "" : "s"} left` : " · all claimed"}
          </span>
        </span>
        <span className="muted small">{open ? "Hide" : "Details"}</span>
      </button>

      {open && (
        <ul className="live-list">
          {statuses.map(({ person, status }) => {
            const count = Object.values(claims).filter((ids) => ids.includes(person.id)).length;
            return (
              <li key={person.id} style={{ "--pc": `var(--p${person.color})` } as CSSProperties}>
                <Avatar person={person} size={26} />
                <span className="live-name">{person.name}</span>
                <span className={`live-status is-${status}`}>
                  {status === "done" && <Icon name="check" size={13} />}
                  {STATUS_LABEL[status]}
                  {status !== "waiting" && count > 0 ? ` · ${count}` : ""}
                </span>
                {needsReminder(person, claims) && (
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => void send(nudgeText(bill, person, link))}
                  >
                    Nudge
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="live-actions">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => void send(reminderText(bill, people, claims, link, payerId))}
          disabled={waiting.length === 0 && unclaimed.length === 0}
        >
          <Icon name="warn" size={16} /> Remind everyone
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void invite()}>
          <Icon name="share" size={16} /> Link
        </button>
      </div>
    </section>
  );
}

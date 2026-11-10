// What a friend sees after opening a shared bill link: pick your name, check
// off what you ordered, then see what you owe (with a Venmo button).

import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { Avatar, Icon } from "./components/common";
import { ResultsStep } from "./components/ResultsStep";
import { SplitStep } from "./components/SplitStep";
import { formatMoney, setCurrency } from "./lib/money";
import { billTotal } from "./lib/receipt";
import { fromSnapshot, tabApi, type TabSnapshot } from "./lib/tabApi";
import type { Claims } from "./lib/types";
import type { Action } from "./state";

const POLL_MS = 3000;
const meKey = (tabId: string) => `bill-split:guest:${tabId}`;

function loadMe(tabId: string): string | null {
  try {
    return localStorage.getItem(meKey(tabId));
  } catch {
    return null;
  }
}

function saveMe(tabId: string, personId: string | null) {
  try {
    if (personId) localStorage.setItem(meKey(tabId), personId);
    else localStorage.removeItem(meKey(tabId));
  } catch {
    // Without storage they'll just pick their name again next visit.
  }
}

export function GuestApp({ tabId }: { tabId: string }) {
  const [snap, setSnap] = useState<TabSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<string | null>(() => loadMe(tabId));
  const [view, setView] = useState<"claim" | "results">("claim");
  const [toast, setToast] = useState<string | null>(null);
  const inflight = useRef(0);
  const toastTimer = useRef<number | undefined>(undefined);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  const refresh = useCallback(async () => {
    if (inflight.current > 0) return;
    try {
      const s = await tabApi.get(tabId);
      if (inflight.current > 0) return;
      setSnap(s);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load this bill.");
    }
  }, [tabId]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const send = useCallback(
    (op: () => Promise<unknown>) => {
      inflight.current += 1;
      op()
        .catch(() => notify("Couldn't save that. Check your connection."))
        .finally(() => {
          inflight.current -= 1;
          void refresh();
        });
    },
    [notify, refresh],
  );

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view, me]);

  if (!snap) {
    return (
      <main className="page join">
        {error ? (
          <div className="callout callout-danger" role="alert">
            <Icon name="warn" />
            <p>{error}</p>
          </div>
        ) : (
          <p className="muted" style={{ textAlign: "center" }}>
            Loading the bill…
          </p>
        )}
      </main>
    );
  }

  setCurrency(snap.bill.currency);
  const { people, claims } = fromSnapshot(snap);
  const mePerson = people.find((p) => p.id === me) ?? null;

  if (!mePerson) {
    return (
      <JoinScreen
        snap={snap}
        onPick={async (personId) => {
          inflight.current += 1;
          try {
            await tabApi.join(tabId, personId);
            saveMe(tabId, personId);
            setMe(personId);
            setView("claim");
          } catch (e) {
            notify(e instanceof Error ? e.message : "Couldn't join");
          } finally {
            inflight.current -= 1;
            void refresh();
          }
        }}
        onNew={async (name) => {
          inflight.current += 1;
          try {
            const { person } = await tabApi.addPerson(tabId, { name }, true);
            saveMe(tabId, person.id);
            setMe(person.id);
            setView("claim");
          } catch (e) {
            notify(e instanceof Error ? e.message : "Couldn't join");
          } finally {
            inflight.current -= 1;
            void refresh();
          }
        }}
        toast={toast}
      />
    );
  }

  // Only "check this item for me" does anything for a guest.
  const guestDispatch = (action: Action) => {
    if (action.type !== "toggleClaim") return;
    const on = !(claims[action.itemId] ?? []).includes(mePerson.id);
    const next: Claims = {
      ...claims,
      [action.itemId]: on
        ? [...(claims[action.itemId] ?? []), mePerson.id]
        : (claims[action.itemId] ?? []).filter((id) => id !== mePerson.id),
    };
    setSnap({ ...snap, claims: next });
    send(() => tabApi.claim(tabId, mePerson.id, action.itemId, on));
  };

  return (
    <div className="app">
      <header className="topbar">
        {view === "results" ? (
          <button
            type="button"
            className="icon-btn"
            aria-label="Back to my items"
            onClick={() => {
              setView("claim");
              send(() => tabApi.done(tabId, mePerson.id, false));
            }}
          >
            <Icon name="back" />
          </button>
        ) : (
          <span />
        )}
        <div className="topbar-title">
          <span>{view === "results" ? "Who owes what" : (snap.bill.merchant ?? "Your items")}</span>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            saveMe(tabId, null);
            setMe(null);
          }}
        >
          Not {mePerson.name}?
        </button>
      </header>

      {view === "claim" ? (
        <SplitStep
          guest
          bill={snap.bill}
          people={people}
          claims={claims}
          activePersonId={mePerson.id}
          dispatch={guestDispatch}
          onDone={() => {
            send(() => tabApi.done(tabId, mePerson.id, true));
            setView("results");
          }}
        />
      ) : (
        <ResultsStep
          bill={snap.bill}
          people={people}
          claims={claims}
          payerId={snap.payerId}
          onSetPayer={() => undefined}
          venmo={snap.venmo}
          onVenmoChange={() => undefined}
          notify={notify}
          viewerId={mePerson.id}
        />
      )}

      <div className={`toast ${toast ? "show" : ""}`} role="status" aria-live="polite">
        {toast}
      </div>
    </div>
  );
}

function JoinScreen({
  snap,
  onPick,
  onNew,
  toast,
}: {
  snap: TabSnapshot;
  onPick: (personId: string) => Promise<void>;
  onNew: (name: string) => Promise<void>;
  toast: string | null;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const { people } = fromSnapshot(snap);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed) void run(() => onNew(trimmed));
  }

  return (
    <div className="app">
      <main className="page join">
        <section className="hero">
          <div className="hero-mark" aria-hidden="true">
            <Icon name="receipt" size={30} />
          </div>
          <h1>{snap.bill.merchant ?? "Split the bill"}</h1>
          <p>
            {formatMoney(billTotal(snap.bill))} total. Pick your name, then check off what you ordered.
          </p>
        </section>

        {people.length > 0 && (
          <section className="join-list" aria-label="Who are you?">
            <h2 className="field-label">Who are you?</h2>
            {people.map((p) => (
              <button
                key={p.id}
                type="button"
                className="join-person"
                style={{ "--pc": `var(--p${p.color})` } as CSSProperties}
                disabled={busy}
                onClick={() => void run(() => onPick(p.id))}
              >
                <Avatar person={p} size={32} />
                {p.name}
                {p.done ? (
                  <span className="muted">done</span>
                ) : p.joined ? (
                  <span className="muted">joined</span>
                ) : null}
              </button>
            ))}
          </section>
        )}

        <form className="field" onSubmit={submit}>
          <span className="field-label">{people.length ? "Not on the list?" : "What's your name?"}</span>
          <div className="join-new">
            <input
              type="text"
              value={name}
              placeholder="Your name"
              aria-label="Your name"
              autoCapitalize="words"
              autoComplete="given-name"
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
            />
            <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>
              Join
            </button>
          </div>
        </form>
      </main>
      <div className={`toast ${toast ? "show" : ""}`} role="status" aria-live="polite">
        {toast}
      </div>
    </div>
  );
}

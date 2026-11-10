// Keeps the host's phone and a shared bill in step. The host's own changes
// go to the server as they happen; friends' joins and claims come back by
// polling every few seconds.

import { useCallback, useEffect, useRef, type Dispatch } from "react";
import { fromSnapshot, tabApi } from "./lib/tabApi";
import { PERSON_COLORS, newId, type AppState } from "./lib/types";
import type { Action } from "./state";

const POLL_MS = 3000;
const META_DEBOUNCE_MS = 700;

export function useHostSync(
  state: AppState,
  dispatch: Dispatch<Action>,
  notify: (message: string) => void,
) {
  const stateRef = useRef(state);
  stateRef.current = state;
  const inflight = useRef(0);
  const lastMeta = useRef<string | null>(null);
  const tab = state.sharedTab;

  const restoring = useRef(false);
  const refresh = useCallback(
    async (open = false) => {
      const current = stateRef.current.sharedTab;
      if (!current || inflight.current > 0 || restoring.current) return;
      try {
        const snap = await tabApi.get(current.id, open);
        // Skip if the host changed something while this request was out.
        if (inflight.current > 0 || stateRef.current.sharedTab?.id !== current.id) return;
        dispatch({ type: "applyRemote", ...fromSnapshot(snap) });
      } catch (e) {
        if (!(e instanceof Error && /expired|doesn't exist/.test(e.message))) return; // offline: retry next tick
        // The server let it expire, but this phone has everything: put it back
        // under the same link so friends' links keep working.
        const s = stateRef.current;
        if (!s.bill || !s.sharedTab) return;
        restoring.current = true;
        try {
          await tabApi.restore(s.sharedTab.id, s.sharedTab.hostKey, s.bill, s.people, s.claims, s.payerId, s.venmo);
          lastMeta.current = JSON.stringify([s.bill, s.payerId, s.venmo]);
          notify("Your shared bill had expired. It's back, same link.");
        } catch {
          // Try again on the next tick.
        } finally {
          restoring.current = false;
        }
      }
    },
    [dispatch, notify],
  );

  /** Runs a change on the server, then pulls the latest state. */
  const send = useCallback(
    (op: () => Promise<unknown>) => {
      inflight.current += 1;
      op()
        .catch(() => notify("Couldn't sync that change. Check your connection."))
        .finally(() => {
          inflight.current -= 1;
          void refresh();
        });
    },
    [notify, refresh],
  );

  // Poll for friends' updates while the page is visible.
  useEffect(() => {
    if (!tab) return;
    void refresh(true);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && void refresh(true);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [tab?.id, refresh]); // eslint-disable-line react-hooks/exhaustive-deps

  // Push the bill, payer and Venmo name (host-only fields) shortly after edits.
  const metaJson = JSON.stringify([state.bill, state.payerId, state.venmo]);
  useEffect(() => {
    if (!tab || !state.bill || metaJson === lastMeta.current) return;
    const timer = window.setTimeout(() => {
      const s = stateRef.current;
      if (!s.bill || !s.sharedTab) return;
      lastMeta.current = metaJson;
      send(() => tabApi.setMeta(tab.id, tab.hostKey, s.bill!, s.payerId, s.venmo));
    }, META_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [metaJson, tab, send, state.bill]);

  /** Like dispatch, but also sends people/claim changes to the shared bill. */
  const hostDispatch = useCallback(
    (action: Action) => {
      const s = stateRef.current;
      const t = s.sharedTab;
      if (!t) return dispatch(action);

      switch (action.type) {
        case "addPerson": {
          const used = new Set(s.people.map((p) => p.color));
          const color =
            Array.from({ length: PERSON_COLORS }, (_, i) => i).find((c) => !used.has(c)) ??
            s.people.length % PERSON_COLORS;
          const id = newId("p");
          dispatch({ ...action, id, color });
          send(() => tabApi.addPerson(t.id, { id, name: action.name, color }, false));
          return;
        }
        case "renamePerson":
          dispatch(action);
          send(() => tabApi.rename(t.id, t.hostKey, action.id, action.name));
          return;
        case "removePerson":
          dispatch(action);
          send(() => tabApi.remove(t.id, t.hostKey, action.id));
          return;
        case "toggleClaim": {
          const personId = s.activePersonId;
          if (!personId) return;
          const on = !(s.claims[action.itemId] ?? []).includes(personId);
          dispatch(action);
          send(() => tabApi.claim(t.id, personId, action.itemId, on));
          return;
        }
        default:
          dispatch(action);
      }
    },
    [dispatch, send],
  );

  /** Uploads the bill the first time; returns the shared bill's id. */
  const ensureShared = useCallback(async (): Promise<string> => {
    const s = stateRef.current;
    if (s.sharedTab) return s.sharedTab.id;
    if (!s.bill) throw new Error("No bill to share.");
    const created = await tabApi.create(s.bill, s.people, s.claims, s.payerId, s.venmo);
    lastMeta.current = JSON.stringify([s.bill, s.payerId, s.venmo]);
    dispatch({ type: "setSharedTab", tab: created });
    return created.id;
  }, [dispatch]);

  return { hostDispatch, ensureShared };
}

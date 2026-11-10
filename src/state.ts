import {
  PERSON_COLORS,
  newId,
  type AppState,
  type Bill,
  type Claims,
  type Person,
  type Step,
} from "./lib/types";

export type Action =
  | { type: "loadBill"; bill: Bill; venmo?: string }
  | { type: "reopen"; state: AppState }
  | { type: "updateBill"; bill: Bill }
  | { type: "goTo"; step: Step }
  | { type: "addPerson"; name: string; id?: string; color?: number }
  | { type: "renamePerson"; id: string; name: string }
  | { type: "removePerson"; id: string }
  | { type: "setActive"; id: string }
  | { type: "setPayer"; id: string | null }
  | { type: "toggleClaim"; itemId: string }
  | { type: "setShared"; itemIds: string[]; shared: boolean }
  | { type: "setVenmo"; venmo: string }
  | { type: "setSharedTab"; tab: { id: string; hostKey: string } | null }
  | { type: "applyRemote"; people: Person[]; claims: Claims }
  | { type: "reset" };

export const initialState: AppState = {
  step: "scan",
  bill: null,
  people: [],
  claims: {},
  activePersonId: null,
  payerId: null,
  venmo: "",
  sharedTab: null,
};

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "loadBill":
      return { ...initialState, bill: action.bill, venmo: action.venmo ?? "", step: "review" };

    case "reopen":
      return { ...initialState, ...action.state, step: action.state.people.length ? "split" : "review" };

    case "updateBill":
      return { ...state, bill: action.bill };

    case "goTo":
      return { ...state, step: action.step };

    case "addPerson": {
      const used = new Set(state.people.map((p) => p.color));
      const color =
        action.color ??
        Array.from({ length: PERSON_COLORS }, (_, i) => i).find((c) => !used.has(c)) ??
        state.people.length % PERSON_COLORS;
      const person = { id: action.id ?? newId("p"), name: action.name, color };
      return { ...state, people: [...state.people, person], activePersonId: person.id };
    }

    case "renamePerson":
      return {
        ...state,
        people: state.people.map((p) => (p.id === action.id ? { ...p, name: action.name } : p)),
      };

    case "removePerson": {
      const people = state.people.filter((p) => p.id !== action.id);
      const claims = Object.fromEntries(
        Object.entries(state.claims).map(([itemId, ids]) => [
          itemId,
          ids.filter((id) => id !== action.id),
        ]),
      );
      const activePersonId =
        state.activePersonId === action.id ? (people.at(-1)?.id ?? null) : state.activePersonId;
      const payerId = state.payerId === action.id ? null : state.payerId;
      return { ...state, people, claims, activePersonId, payerId };
    }

    case "setPayer":
      return { ...state, payerId: action.id };

    case "setVenmo":
      return { ...state, venmo: action.venmo };

    case "setSharedTab":
      return { ...state, sharedTab: action.tab };

    case "applyRemote": {
      // Friends may have joined or claimed on their phones. Keep the host's
      // selection if that person still exists.
      const stillThere = action.people.some((p) => p.id === state.activePersonId);
      return {
        ...state,
        people: action.people,
        claims: action.claims,
        activePersonId: stillThere ? state.activePersonId : (action.people.at(-1)?.id ?? null),
        payerId: action.people.some((p) => p.id === state.payerId) ? state.payerId : null,
      };
    }

    case "setActive":
      return { ...state, activePersonId: action.id };

    case "toggleClaim": {
      const personId = state.activePersonId;
      if (!personId) return state;
      const current = state.claims[action.itemId] ?? [];
      const next = current.includes(personId)
        ? current.filter((id) => id !== personId)
        : [...current, personId];
      return { ...state, claims: { ...state.claims, [action.itemId]: next } };
    }

    case "setShared": {
      if (!state.bill) return state;
      const ids = new Set(action.itemIds);
      return {
        ...state,
        bill: {
          ...state.bill,
          items: state.bill.items.map((item) =>
            ids.has(item.id) ? { ...item, shared: action.shared } : item,
          ),
        },
      };
    }

    case "reset":
      return initialState;
  }
}

const STORAGE_KEY = "bill-split:v1";

/** Restores an in-progress split (e.g. after switching apps to text someone). */
export function loadSavedState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState;
    const saved = JSON.parse(raw) as AppState;
    if (!saved || typeof saved !== "object" || !Array.isArray(saved.people)) return initialState;
    if (saved.step !== "scan" && !saved.bill) return initialState;
    return { ...initialState, ...saved };
  } catch {
    return initialState;
  }
}

export function saveState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private browsing or storage full: the app still works, it just won't resume.
  }
}

// The receipt photo is stored separately: it's large, and if the browser's
// storage is full the rest of the split must still save.
const PHOTO_KEY = "bill-split:photo:v1";

export function loadSavedPhoto(): string | null {
  try {
    return localStorage.getItem(PHOTO_KEY);
  } catch {
    return null;
  }
}

export function savePhoto(photo: string | null): void {
  try {
    // Clear first so a failed save never leaves an older bill's photo behind.
    localStorage.removeItem(PHOTO_KEY);
    if (photo) localStorage.setItem(PHOTO_KEY, photo);
  } catch {
    // Too big to store: the photo still shows until the page is reloaded.
  }
}

// Unfinished bills: starting a new bill tucks the current one away here
// (if anyone was added to it) so it can be reopened later instead of lost.
const HISTORY_KEY = "bill-split:history:v1";
const HISTORY_LIMIT = 15;

export interface SavedBill {
  savedAt: number;
  state: AppState;
}

export function loadHistory(): SavedBill[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]") as unknown;
    return Array.isArray(parsed) ? (parsed as SavedBill[]).filter((h) => h?.state?.bill) : [];
  } catch {
    return [];
  }
}

function writeHistory(list: SavedBill[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, HISTORY_LIMIT)));
  } catch {
    // Storage full: older bills just won't be kept.
  }
}

/** Saves the current bill to the unfinished list, if it's worth keeping. */
export function archiveState(state: AppState): SavedBill[] {
  const list = loadHistory();
  if (!state.bill || (state.people.length === 0 && !state.sharedTab)) return list;
  const sameBill = (h: SavedBill) =>
    (state.sharedTab && h.state.sharedTab?.id === state.sharedTab.id) || h.state.bill === state.bill;
  const next = [{ savedAt: Date.now(), state }, ...list.filter((h) => !sameBill(h))];
  writeHistory(next);
  return next;
}

export function removeFromHistory(savedAt: number): SavedBill[] {
  const next = loadHistory().filter((h) => h.savedAt !== savedAt);
  writeHistory(next);
  return next;
}

// The Venmo username used for pay links by default, saved on this phone.
const MY_VENMO_KEY = "bill-split:my-venmo:v1";

export function loadMyVenmo(): string {
  try {
    return localStorage.getItem(MY_VENMO_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveMyVenmo(venmo: string): void {
  try {
    if (venmo) localStorage.setItem(MY_VENMO_KEY, venmo);
    else localStorage.removeItem(MY_VENMO_KEY);
  } catch {
    // Not saved for next time, but still used for this bill.
  }
}

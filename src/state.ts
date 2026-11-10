import { PERSON_COLORS, newId, type AppState, type Bill, type Step } from "./lib/types";

export type Action =
  | { type: "loadBill"; bill: Bill }
  | { type: "updateBill"; bill: Bill }
  | { type: "goTo"; step: Step }
  | { type: "addPerson"; name: string }
  | { type: "renamePerson"; id: string; name: string }
  | { type: "removePerson"; id: string }
  | { type: "setActive"; id: string }
  | { type: "setPayer"; id: string | null }
  | { type: "toggleClaim"; itemId: string }
  | { type: "setShared"; itemIds: string[]; shared: boolean }
  | { type: "reset" };

export const initialState: AppState = {
  step: "scan",
  bill: null,
  people: [],
  claims: {},
  activePersonId: null,
  payerId: null,
};

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "loadBill":
      return { ...initialState, bill: action.bill, step: "review" };

    case "updateBill":
      return { ...state, bill: action.bill };

    case "goTo":
      return { ...state, step: action.step };

    case "addPerson": {
      const used = new Set(state.people.map((p) => p.color));
      const color =
        Array.from({ length: PERSON_COLORS }, (_, i) => i).find((c) => !used.has(c)) ??
        state.people.length % PERSON_COLORS;
      const person = { id: newId("p"), name: action.name, color };
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

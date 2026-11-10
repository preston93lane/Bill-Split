// Venmo payment links (https://venmo.com/paymentlinks). They open the Venmo
// app with the amount and note already filled in; nothing is sent until the
// person taps Pay or Request themselves.

/** "@Preston-Lane " -> "Preston-Lane"; returns "" if nothing usable is left. */
export function cleanVenmoUsername(raw: string): string {
  return raw.trim().replace(/^@+/, "").replace(/[^A-Za-z0-9_-]/g, "");
}

function amount(cents: number): string {
  return (cents / 100).toFixed(2);
}

function params(fields: Record<string, string>): string {
  return new URLSearchParams(fields).toString();
}

/** Link a friend taps to pay the person who covered the bill. */
export function venmoPayLink(username: string, cents: number, note: string): string {
  return `https://venmo.com/${encodeURIComponent(username)}?${params({
    txn: "pay",
    amount: amount(cents),
    note,
  })}`;
}

/** Link the payer taps to request money; they pick the friend inside Venmo. */
export function venmoRequestLink(cents: number, note: string): string {
  return `https://venmo.com/?${params({ txn: "charge", amount: amount(cents), note })}`;
}

export function venmoNote(merchant: string | null): string {
  return merchant ? `${merchant} 🧾` : "Dinner 🧾";
}


// Remember each payer's Venmo username on this device so it only gets typed once.
const KEY = "bill-split:venmo:v1";

function readAll(): Record<string, string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "{}") as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function rememberedVenmo(name: string): string {
  return readAll()[name.trim().toLowerCase()] ?? "";
}

export function rememberVenmo(name: string, username: string): void {
  try {
    const all = readAll();
    const key = name.trim().toLowerCase();
    if (username) all[key] = username;
    else delete all[key];
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Storage unavailable: they'll just have to type it again next time.
  }
}

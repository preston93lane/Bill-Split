import { describe, expect, it } from "vitest";
import { emptyBill, makeItem } from "./receipt";
import { buildShareText } from "./share";
import { computeSplit } from "./split";
import type { Person } from "./types";
import { cleanVenmoUsername, venmoPayLink, venmoRequestLink } from "./venmo";

describe("venmo links", () => {
  it("cleans usernames", () => {
    expect(cleanVenmoUsername(" @Preston-Lane ")).toBe("Preston-Lane");
    expect(cleanVenmoUsername("@@")).toBe("");
  });

  it("prefills amount and note", () => {
    expect(venmoPayLink("Preston-Lane", 2083, "Joe's 🧾")).toBe(
      "https://venmo.com/Preston-Lane?txn=pay&amount=20.83&note=Joe%27s+%F0%9F%A7%BE",
    );
    expect(venmoRequestLink(500, "Dinner")).toBe(
      "https://venmo.com/?txn=charge&amount=5.00&note=Dinner",
    );
  });

  it("adds a pay link for everyone except the payer", () => {
    const a: Person = { id: "a", name: "Andrew", color: 0 };
    const p: Person = { id: "p", name: "Preston", color: 1 };
    const burger = makeItem("Burger", 2000);
    const tacos = makeItem("Tacos", 1000);
    const bill = { ...emptyBill(), merchant: "Joe's", items: [burger, tacos] };
    const split = computeSplit(bill, [a, p], { [burger.id]: ["a"], [tacos.id]: ["p"] });
    const text = buildShareText(bill, split, { payer: p, venmo: "Preston-Lane", details: false });
    expect(text).toContain("Preston: $10.00 (paid the bill)");
    expect(text).toContain("Pay Preston on Venmo (@Preston-Lane):");
    expect(text).toContain("Andrew: https://venmo.com/Preston-Lane?txn=pay&amount=20.00");
    expect(text).not.toContain("Preston: https://");
    expect(text).not.toContain("Details");
  });
});

describe("shared bill reminders", async () => {
  const { reminderText, statusOf } = await import("./invite");
  it("only reminds people who still need to act", () => {
    const host: Person = { id: "h", name: "Preston", color: 0 };
    const picking: Person = { id: "a", name: "Andrew", color: 1, joined: true };
    const done: Person = { id: "n", name: "Nathan", color: 2, joined: true, done: true };
    const waiting: Person = { id: "w", name: "Aaron", color: 3 };
    const steak = makeItem("Steak", 3000);
    const fries = makeItem("Fries", 500);
    const bill = { ...emptyBill(), merchant: "Joe's", items: [steak, fries] };
    const claims = { [steak.id]: ["h"] };
    expect(statusOf(host, claims)).toBe("byHost");
    expect(statusOf(waiting, claims)).toBe("waiting");
    const text = reminderText(bill, [host, picking, done, waiting], claims, "https://x/?tab=1", null);
    expect(text).toContain("Still waiting on: Andrew, Aaron");
    expect(text).toContain("1 item still unclaimed ($5.00): Fries");
  });
});

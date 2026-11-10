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

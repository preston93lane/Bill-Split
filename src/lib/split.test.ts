import { describe, expect, it } from "vitest";
import { allocateProportionally, parseMoneyInput, splitEvenly } from "./money";
import { billFromParsed, billTotal, checkBill, emptyBill, makeItem } from "./receipt";
import { buildShareText } from "./share";
import { computeSplit, unclaimedItems } from "./split";
import type { Bill, Person } from "./types";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

const alice: Person = { id: "a", name: "Alice", color: 0 };
const bob: Person = { id: "b", name: "Bob", color: 1 };
const cara: Person = { id: "c", name: "Cara", color: 2 };

function bill(partial: Partial<Bill>): Bill {
  return { ...emptyBill(), ...partial };
}

describe("money helpers", () => {
  it("splits evenly and keeps every penny", () => {
    expect(splitEvenly(1000, 3)).toEqual([334, 333, 333]);
    expect(splitEvenly(1000, 3, 1)).toEqual([333, 334, 333]);
    expect(splitEvenly(-500, 3)).toEqual([-167, -167, -166]);
    expect(sum(splitEvenly(997, 7))).toBe(997);
  });

  it("allocates proportionally with exact totals", () => {
    expect(allocateProportionally(300, [100, 200])).toEqual([100, 200]);
    const parts = allocateProportionally(1001, [333, 333, 334]);
    expect(sum(parts)).toBe(1001);
    expect(allocateProportionally(90, [0, 0, 0])).toEqual([30, 30, 30]);
    expect(allocateProportionally(100, [-50, 100])).toEqual([0, 100]);
  });

  it("parses typed money", () => {
    expect(parseMoneyInput("$12.5")).toBe(1250);
    expect(parseMoneyInput("1,200.00")).toBe(120000);
    expect(parseMoneyInput("-3")).toBe(-300);
    expect(parseMoneyInput("")).toBeNull();
    expect(parseMoneyInput("abc")).toBeNull();
  });
});

describe("computeSplit", () => {
  it("splits tax and tip in proportion to what each person ordered", () => {
    const steak = makeItem("Steak", 3000);
    const salad = makeItem("Salad", 1000);
    const b = bill({ items: [steak, salad], taxCents: 400, tipCents: 800 });
    const result = computeSplit(b, [alice, bob], { [steak.id]: ["a"], [salad.id]: ["b"] });

    const [a, bb] = result.people;
    expect(a?.itemsCents).toBe(3000);
    expect(a?.taxCents).toBe(300);
    expect(a?.tipCents).toBe(600);
    expect(a?.totalCents).toBe(3900);
    expect(bb?.totalCents).toBe(1300);
    expect(result.unclaimed).toEqual([]);
  });

  it("splits an item evenly between everyone who claimed it", () => {
    const pizza = makeItem("Pizza", 2000);
    const result = computeSplit(bill({ items: [pizza] }), [alice, bob, cara], {
      [pizza.id]: ["a", "c"],
    });
    expect(result.people.map((p) => p.itemsCents)).toEqual([1000, 0, 1000]);
    expect(result.people[0]?.lines[0]?.splitWays).toBe(2);
  });

  it("splits table dishes across everyone, including people added later", () => {
    const nachos = makeItem("Nachos", 1200, true);
    const b = bill({ items: [nachos] });
    expect(computeSplit(b, [alice, bob], {}).people.map((p) => p.itemsCents)).toEqual([
      600, 600,
    ]);
    expect(computeSplit(b, [alice, bob, cara], {}).people.map((p) => p.itemsCents)).toEqual([
      400, 400, 400,
    ]);
  });

  it("reports unclaimed items and ignores claims from removed people", () => {
    const fries = makeItem("Fries", 500);
    const soda = makeItem("Soda", 300);
    const b = bill({ items: [fries, soda] });
    const claims = { [fries.id]: ["a"], [soda.id]: ["zzz-removed"] };
    expect(unclaimedItems(b, [alice], claims).map((i) => i.name)).toEqual(["Soda"]);
  });

  it("always adds up to the bill total, to the penny", () => {
    const items = [
      makeItem("A", 1333),
      makeItem("B", 2717, true),
      makeItem("C", 999),
      makeItem("Comp", -500),
      makeItem("D", 4201),
    ];
    const b = bill({ items, taxCents: 787, tipCents: 1777, feesCents: 251 });
    const claims = {
      [items[0]!.id]: ["a", "b", "c"],
      [items[2]!.id]: ["b"],
      [items[3]!.id]: ["b"],
      [items[4]!.id]: ["a", "c"],
    };
    const result = computeSplit(b, [alice, bob, cara], claims);
    expect(result.unclaimed).toEqual([]);
    expect(sum(result.people.map((p) => p.totalCents))).toBe(billTotal(b));
    expect(sum(result.people.map((p) => p.taxCents))).toBe(787);
    expect(sum(result.people.map((p) => p.tipCents))).toBe(1777);
  });
});

describe("billFromParsed", () => {
  it("converts dollars to cents and expands multi-quantity lines", () => {
    const b = billFromParsed({
      is_receipt: true,
      merchant: "Joe's",
      currency: "USD",
      items: [
        { name: "Beer", quantity: 3, total_price: 21 },
        { name: "Burger", quantity: 1, total_price: 14.5 },
      ],
      subtotal: 35.5,
      tax: 3.2,
      tip: null,
      fees: null,
      total: 38.7,
    });
    expect(b.items.map((i) => [i.name, i.priceCents])).toEqual([
      ["Beer (1/3)", 700],
      ["Beer (2/3)", 700],
      ["Beer (3/3)", 700],
      ["Burger", 1450],
    ]);
    expect(b.taxCents).toBe(320);
    expect(b.tipCents).toBe(0);
    expect(checkBill(b)).toEqual([]);
  });

  it("flags a subtotal that doesn't match the items", () => {
    const b = bill({ items: [makeItem("Pasta", 1800)], printedSubtotalCents: 2400 });
    expect(checkBill(b)).toHaveLength(1);
  });

  it("accepts a printed total from before the tip was added", () => {
    const b = bill({
      items: [makeItem("Pasta", 1800)],
      taxCents: 200,
      tipCents: 400,
      printedTotalCents: 2000,
    });
    expect(checkBill(b)).toEqual([]);
  });
});

describe("buildShareText", () => {
  it("lists everyone's total and their items", () => {
    const wings = makeItem("Wings", 1200, true);
    const burger = makeItem("Burger", 1500);
    const b = bill({ merchant: "Joe's", items: [wings, burger], taxCents: 270 });
    const text = buildShareText(b, computeSplit(b, [alice, bob], { [burger.id]: ["a"] }));
    expect(text).toContain("Joe's bill split");
    expect(text).toContain("Alice: $23.10");
    expect(text).toContain("Bob: $6.60");
    expect(text).toContain("Wings (table, ½)");
  });
});

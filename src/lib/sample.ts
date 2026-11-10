import { billFromParsed } from "./receipt";
import type { Bill } from "./types";

/** A made-up dinner for trying the app without a receipt or API key. */
export function sampleBill(): Bill {
  return billFromParsed({
    is_receipt: true,
    merchant: "The Copper Pot",
    currency: "USD",
    items: [
      { name: "Spinach Artichoke Dip", quantity: 1, total_price: 13.5 },
      { name: "Truffle Fries", quantity: 1, total_price: 9 },
      { name: "Margherita Pizza", quantity: 1, total_price: 18 },
      { name: "Steak Frites", quantity: 1, total_price: 32 },
      { name: "Caesar Salad", quantity: 1, total_price: 12 },
      { name: "Grilled Salmon", quantity: 1, total_price: 27 },
      { name: "IPA", quantity: 2, total_price: 16 },
      { name: "Pinot Noir", quantity: 1, total_price: 14 },
      { name: "Lemonade", quantity: 1, total_price: 4.5 },
    ],
    subtotal: 146,
    tax: 12.96,
    tip: null,
    fees: null,
    total: 158.96,
  });
}

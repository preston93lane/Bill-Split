import { z } from "zod";

// The shape Gemini fills in when it reads a receipt photo. Amounts are plain
// numbers in the receipt's currency (e.g. 12.5 for $12.50).
export const ParsedReceiptSchema = z.object({
  is_receipt: z
    .boolean()
    .describe("False if the image is not a readable restaurant bill or receipt."),
  merchant: z.string().nullable().describe("Restaurant name, if printed."),
  currency: z
    .string()
    .nullable()
    .describe("ISO 4217 currency code such as USD or EUR, if it can be inferred."),
  items: z
    .array(
      z.object({
        name: z.string().describe("Item name as printed, cleaned up for readability."),
        quantity: z.number().describe("Quantity ordered; 1 if not shown."),
        total_price: z
          .number()
          .describe(
            "Line total for this row (unit price x quantity). Negative for an item-specific discount or comp.",
          ),
      }),
    )
    .describe("Every food and drink line item, in the order printed."),
  subtotal: z.number().nullable().describe("Printed subtotal before tax, if shown."),
  tax: z.number().nullable().describe("Total tax. Sum multiple tax lines."),
  tip: z
    .number()
    .nullable()
    .describe(
      "Tip or gratuity actually charged or written in (including automatic gratuity). Null if none.",
    ),
  fees: z
    .number()
    .nullable()
    .describe(
      "Other check-level charges that are not tax or tip (service fees, surcharges), minus check-wide discounts. Null if none.",
    ),
  total: z.number().nullable().describe("Final printed total, if shown."),
});

export type ParsedReceipt = z.infer<typeof ParsedReceiptSchema>;

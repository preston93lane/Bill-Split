import { ApiError, GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { ParsedReceiptSchema, type ParsedReceipt } from "./receiptSchema.js";

// A fast Gemini model that's on the free tier and reads images. Override
// with the GEMINI_MODEL environment variable if Google retires it.
const DEFAULT_MODEL = "gemini-3.5-flash-lite";

const MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

// The browser shrinks photos before upload; this only guards against abuse.
const MAX_BASE64_LENGTH = 7_000_000;

const SYSTEM_PROMPT = `You read photos of restaurant bills for a bill-splitting app. Friends will use your output to claim the items they ordered, so every line item and amount must match the receipt exactly.

Rules:
- List every food and drink line that was ordered, in printed order. Do not list subtotal, tax, tip, total, payment, card, change, or balance lines as items.
- If a line shows a quantity (e.g. "2 Margarita 24.00"), set quantity to 2 and total_price to the line total (24.00). Leave the quantity out of the name.
- Priced add-ons or modifiers (e.g. "+ Bacon 2.00" under a burger) belong to the item above them: add their price to that item's total_price instead of listing them separately. Ignore modifiers with no price.
- Leave out voided or $0.00 items. A discount or comp for one specific item is its own line with a negative total_price.
- Tax: the sum of all tax lines.
- Tip: an automatic gratuity, a "gratuity"/"tip" line, or a tip written in by hand on a signed copy. Null if there is none.
- Fees: other check-level charges that are not tax or tip (service fee, kitchen fee, surcharge), minus any check-wide discount. Null if there are none.
- Expand cryptic abbreviations into readable names when the meaning is clear (e.g. "CHKN SAND" -> "Chicken Sandwich"), otherwise keep the printed text.
- Copy amounts as printed. If part of the receipt is unreadable, extract what you can.
- Set is_receipt to false only if the image is not a restaurant bill or receipt at all.`;

const RESPONSE_SCHEMA = z.toJSONSchema(ParsedReceiptSchema);

export class ReceiptError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

let client: GoogleGenAI | null = null;

export async function parseReceiptImage(
  base64Data: string,
  mediaType: string,
): Promise<ParsedReceipt> {
  if (!MEDIA_TYPES.includes(mediaType)) {
    throw new ReceiptError("Please upload a JPEG, PNG, WebP or GIF photo.", 400);
  }
  if (!base64Data || base64Data.length > MAX_BASE64_LENGTH) {
    throw new ReceiptError("That photo is empty or too large.", 400);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new ReceiptError("The server has no GEMINI_API_KEY configured.", 500);
  }
  client ??= new GoogleGenAI({ apiKey });

  let text: string | undefined;
  try {
    const response = await client.models.generateContent({
      model: process.env.GEMINI_MODEL || DEFAULT_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: mediaType, data: base64Data } },
            { text: "Extract this bill." },
          ],
        },
      ],
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseJsonSchema: RESPONSE_SCHEMA,
      },
    });
    text = response.text;
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 400 && /api key/i.test(error.message)) {
        throw new ReceiptError("The server's Gemini API key is invalid.", 500);
      }
      if (error.status === 401 || error.status === 403) {
        throw new ReceiptError("The server's Gemini API key is invalid.", 500);
      }
      if (error.status === 429) {
        throw new ReceiptError(
          "Hit the free scan limit for now. Try again in a minute, or type the items in.",
          429,
        );
      }
      if (error.status === 404) {
        throw new ReceiptError(
          "The Gemini model isn't available. Set GEMINI_MODEL to a current model.",
          500,
        );
      }
      if (error.status === 400) {
        throw new ReceiptError("Couldn't read that image. Try another photo.", 400);
      }
      throw new ReceiptError("The receipt reader is unavailable. Try again shortly.", 502);
    }
    throw error;
  }

  let parsed: ParsedReceipt;
  try {
    parsed = ParsedReceiptSchema.parse(JSON.parse(text ?? ""));
  } catch {
    throw new ReceiptError("Couldn't make sense of that receipt. Try a clearer photo.", 422);
  }

  if (!parsed.is_receipt) {
    throw new ReceiptError("That doesn't look like a receipt. Try another photo.", 422);
  }
  if (parsed.items.length === 0) {
    throw new ReceiptError("No items found. Try a closer, flatter photo.", 422);
  }
  return parsed;
}

/** Web-standard handler shared by the Vercel function and the Vite dev server. */
export async function handleParseReceipt(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return Response.json({ error: "Use POST." }, { status: 405 });
  }
  let body: { image?: unknown; mediaType?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }
  if (typeof body.image !== "string" || typeof body.mediaType !== "string") {
    return Response.json({ error: "Expected { image, mediaType }." }, { status: 400 });
  }

  try {
    const receipt = await parseReceiptImage(body.image, body.mediaType);
    return Response.json({ receipt });
  } catch (error) {
    if (error instanceof ReceiptError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("parse-receipt failed", error);
    return Response.json({ error: "Something went wrong reading the receipt." }, { status: 500 });
  }
}

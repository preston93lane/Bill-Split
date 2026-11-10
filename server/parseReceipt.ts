import Anthropic from "@anthropic-ai/sdk";
import { betaStandardSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/beta/standard-schema";
import { ParsedReceiptSchema, type ParsedReceipt } from "./receiptSchema.js";

type ImageMediaType = Anthropic.Beta.BetaBase64ImageSource["media_type"];

const MEDIA_TYPES: readonly ImageMediaType[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

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

export class ReceiptError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

let client: Anthropic | null = null;

export async function parseReceiptImage(
  base64Data: string,
  mediaType: string,
): Promise<ParsedReceipt> {
  if (!MEDIA_TYPES.includes(mediaType as ImageMediaType)) {
    throw new ReceiptError("Please upload a JPEG, PNG, WebP or GIF photo.", 400);
  }
  if (!base64Data || base64Data.length > MAX_BASE64_LENGTH) {
    throw new ReceiptError("That photo is empty or too large.", 400);
  }

  client ??= new Anthropic();

  let response;
  try {
    response = await client.beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      // If the model declines (very unlikely for a receipt), retry server-side
      // on Anthropic's default fallback model instead of failing.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: "medium",
        format: betaStandardSchemaOutputFormat(ParsedReceiptSchema),
      },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType as ImageMediaType,
                data: base64Data,
              },
            },
            { type: "text", text: "Extract this bill." },
          ],
        },
      ],
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      throw new ReceiptError("The server's Anthropic API key is missing or invalid.", 500);
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new ReceiptError("Too many scans right now. Try again in a minute.", 429);
    }
    if (error instanceof Anthropic.BadRequestError) {
      throw new ReceiptError("Couldn't read that image. Try another photo.", 400);
    }
    if (error instanceof Anthropic.APIError) {
      throw new ReceiptError("The receipt reader is unavailable. Try again shortly.", 502);
    }
    if (error instanceof Error && /api key|apiKey|authentication/i.test(error.message)) {
      // Thrown by the SDK before any request when no credentials are configured.
      throw new ReceiptError("The server has no ANTHROPIC_API_KEY configured.", 500);
    }
    throw error;
  }

  if (response.stop_reason === "refusal") {
    throw new ReceiptError("Couldn't read that image. Try another photo.", 422);
  }
  if (response.stop_reason === "max_tokens" || !response.parsed_output) {
    throw new ReceiptError("Couldn't make sense of that receipt. Try a clearer photo.", 422);
  }

  const parsed = response.parsed_output;
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

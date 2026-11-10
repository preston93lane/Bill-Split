// Vercel serverless function: POST /api/parse-receipt
// Keeps the Gemini API key on the server; the browser only sends the photo.
import { handleParseReceipt } from "../server/parseReceipt.js";

export function POST(request: Request): Promise<Response> {
  return handleParseReceipt(request);
}

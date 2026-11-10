// Vercel serverless function: GET/POST /api/tab (shared bills friends claim from).
import { handleTab } from "../server/tabs.js";

export function GET(request: Request): Promise<Response> {
  return handleTab(request);
}

export function POST(request: Request): Promise<Response> {
  return handleTab(request);
}

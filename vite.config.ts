import { Readable } from "node:stream";
import type { ServerResponse } from "node:http";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Connect, type Plugin, type ViteDevServer } from "vite";

// Serves /api/parse-receipt and /api/tab from the dev server using the same
// handlers that run as Vercel functions in production.
function receiptApi(): Plugin {
  return {
    name: "receipt-api",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/api/parse-receipt", (req, res, next) => {
        void (async () => {
          const { handleParseReceipt } = (await server.ssrLoadModule(
            "/server/parseReceipt.ts",
          )) as typeof import("./server/parseReceipt");
          await sendResponse(res, await handleParseReceipt(toRequest(req)));
        })().catch(next);
      });
      server.middlewares.use("/api/tab", (req, res, next) => {
        void (async () => {
          const { handleTab } = (await server.ssrLoadModule(
            "/server/tabs.ts",
          )) as typeof import("./server/tabs");
          await sendResponse(res, await handleTab(toRequest(req)));
        })().catch(next);
      });
    },
  };
}

function toRequest(req: Connect.IncomingMessage): Request {
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  return new Request(`http://localhost${req.originalUrl ?? req.url ?? "/"}`, {
    method: req.method,
    headers: req.headers as Record<string, string>,
    body: hasBody ? (Readable.toWeb(req) as ReadableStream) : undefined,
    // Required by Node's fetch when streaming a request body.
    ...(hasBody ? { duplex: "half" } : {}),
  } as RequestInit);
}

async function sendResponse(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.end(Buffer.from(await response.arrayBuffer()));
}

export default defineConfig(({ mode }) => {
  // Make GEMINI_API_KEY from .env.local visible to the dev API handler.
  // It is never exposed to browser code (no VITE_ prefix).
  const env = loadEnv(mode, process.cwd(), "");
  for (const name of [
    "GEMINI_API_KEY",
    "GEMINI_MODEL",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
  ]) {
    if (env[name] && !process.env[name]) process.env[name] = env[name];
  }
  return {
    plugins: [react(), receiptApi()],
    server: { host: true },
  };
});

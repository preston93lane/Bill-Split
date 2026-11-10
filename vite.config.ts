import { Readable } from "node:stream";
import type { ServerResponse } from "node:http";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Connect, type Plugin, type ViteDevServer } from "vite";

// Serves POST /api/parse-receipt from the dev server using the same handler
// that runs as a Vercel function in production.
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
  for (const name of ["GEMINI_API_KEY", "GEMINI_MODEL"]) {
    if (env[name] && !process.env[name]) process.env[name] = env[name];
  }
  return {
    plugins: [react(), receiptApi()],
    server: { host: true },
  };
});

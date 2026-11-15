import type { Env } from "./env";

export function json(
  status: number,
  body: unknown,
  headers?: HeadersInit,
): Response {
  const responseHeaders = new Headers(headers);
  if (!responseHeaders.has("Content-Type")) {
    responseHeaders.set("Content-Type", "application/json");
  }
  if (!responseHeaders.has("Cache-Control")) {
    responseHeaders.set("Cache-Control", "no-store");
  }
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders,
  });
}

async function handleApi(
  request: Request,
  _env: Env,
  pathname: string,
): Promise<Response> {
  if (pathname === "/api/languages" || pathname === "/api/requests") {
    if (request.method !== "GET" && request.method !== "POST") {
      return json(405, { error: "method not allowed" });
    }
    // Filled by later tasks.
    return json(404, { error: "not found" });
  }
  return json(404, { error: "not found" });
}

const worker = {
  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return handleApi(request, env, url.pathname);
    }
    return env.ASSETS.fetch(request);
  },
};

export default worker;

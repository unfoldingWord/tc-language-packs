import type { Env } from "./env";
import { json } from "./http";
import { listLanguages } from "./languages";
import { handleRequests } from "./requests";

async function handleApi(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response> {
  if (pathname === "/api/languages") {
    if (request.method !== "GET") {
      return json(405, { error: "method not allowed" });
    }
    const languages = await listLanguages(env.PACKS);
    return json(
      200,
      { languages },
      { "Cache-Control": "public, max-age=60" },
    );
  }

  if (pathname === "/api/requests") {
    return handleRequests(request, env);
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
      try {
        return await handleApi(request, env, url.pathname);
      } catch (err) {
        console.error(err);
        return json(500, { error: "internal error" });
      }
    }
    return env.ASSETS.fetch(request);
  },
};

export default worker;

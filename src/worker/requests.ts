import type { Env } from "./env";
import { askStaging, readStatus } from "./staging";
import { decideState, type RequestState } from "./state";
import { normalizeTag } from "./tags";

export type RequestRecord = {
  count: number;
  lastState: RequestState;
  lastReason?: string;
  lastAt: string;
  reasons: string[];
};

const MAX_REASON_LEN = 280;
const RATE_LIMIT = 5;
const RATE_TTL = 3600;
const SEEN_TTL = 86400;
const REASONS_KEEP = 5;

/** Local copy of index.json to avoid a circular import with the router. */
function json(
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

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hourKey(now: Date): string {
  return now.toISOString().slice(0, 13);
}

function dayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function secondsUntilNextHour(now: Date): number {
  const next = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      now.getUTCHours() + 1,
      0,
      0,
      0,
    ),
  );
  return Math.max(1, Math.ceil((next.getTime() - now.getTime()) / 1000));
}

export async function verifyTurnstile(
  secret: string,
  token: string,
  ip: string | null,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const body = new URLSearchParams();
    body.set("secret", secret);
    body.set("response", token);
    if (ip) body.set("remoteip", ip);
    const response = await fetcher(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      { method: "POST", body },
    );
    const data = (await response.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

async function readRecord(
  kv: KVNamespace,
  lang: string,
): Promise<RequestRecord | null> {
  return (await kv.get(`req:${lang}`, "json")) as RequestRecord | null;
}

function clientIp(request: Request): string | null {
  return request.headers.get("CF-Connecting-IP");
}

function replyBody(
  lang: string,
  state: RequestState,
  count: number,
  reason?: string,
): Record<string, unknown> {
  const body: Record<string, unknown> = { lang, state, count };
  if (reason) body.reason = reason;
  return body;
}

async function countAndReply(
  env: Env,
  lang: string,
  seenKey: string,
  o: {
    state: RequestState;
    reason?: string;
    visitorReason?: string;
    now: Date;
  },
): Promise<Response> {
  const existing = await readRecord(env.REQUESTS, lang);
  const reasons = existing?.reasons ? [...existing.reasons] : [];
  if (o.visitorReason) reasons.push(o.visitorReason);

  const record: RequestRecord = {
    count: (existing?.count ?? 0) + 1,
    lastState: o.state,
    lastAt: o.now.toISOString(),
    reasons: reasons.slice(-REASONS_KEEP),
  };
  if (o.reason) record.lastReason = o.reason;

  await env.REQUESTS.put(`req:${lang}`, JSON.stringify(record));
  await env.REQUESTS.put(seenKey, "1", { expirationTtl: SEEN_TTL });

  return json(
    200,
    replyBody(lang, record.lastState, record.count, record.lastReason),
  );
}

async function handlePost(
  request: Request,
  env: Env,
  now = new Date(),
): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "bad request" });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body) ||
    typeof (body as { lang?: unknown }).lang !== "string" ||
    typeof (body as { token?: unknown }).token !== "string"
  ) {
    return json(400, { error: "bad request" });
  }

  const raw = body as { lang: string; reason?: unknown; token: string };
  const lang = normalizeTag(raw.lang);
  if (!lang) {
    return json(400, { error: "bad language" });
  }

  let visitorReason: string | undefined;
  if (raw.reason !== undefined) {
    if (typeof raw.reason !== "string") {
      return json(400, { error: "bad request" });
    }
    const trimmed = raw.reason.trim();
    if (trimmed.length > MAX_REASON_LEN) {
      return json(400, { error: "bad request" });
    }
    if (trimmed.length > 0) visitorReason = trimmed;
  }

  const ip = clientIp(request);
  const ok = await verifyTurnstile(env.TURNSTILE_SECRET, raw.token, ip);
  if (!ok) {
    return json(403, { error: "check failed" });
  }

  const ipHash = await sha256Hex(ip ?? "");
  const rlKey = `rl:${ipHash}:${hourKey(now)}`;
  const rlRaw = await env.REQUESTS.get(rlKey);
  const rlCount = rlRaw ? Number.parseInt(rlRaw, 10) || 0 : 0;
  if (rlCount >= RATE_LIMIT) {
    return json(
      429,
      { error: "too many requests" },
      { "Retry-After": String(secondsUntilNextHour(now)) },
    );
  }
  await env.REQUESTS.put(rlKey, String(rlCount + 1), {
    expirationTtl: RATE_TTL,
  });

  const seenKey = `seen:${ipHash}:${lang}:${dayKey(now)}`;

  let hasV3 = false;
  try {
    const head = await env.PACKS.head(`v3/catalog/${lang}.seg`);
    hasV3 = head !== null;
  } catch {
    return countAndReply(env, lang, seenKey, {
      state: "try-later",
      reason: "status-unreadable",
      visitorReason,
      now,
    });
  }

  if (hasV3) {
    return json(200, { lang, state: "available", count: 0 });
  }

  const seen = await env.REQUESTS.get(seenKey);
  if (seen) {
    const existing = await readRecord(env.REQUESTS, lang);
    if (existing) {
      return json(
        200,
        replyBody(
          lang,
          existing.lastState,
          existing.count,
          existing.lastReason,
        ),
      );
    }
  }

  let decided: { state: RequestState; reason?: string };
  try {
    const staging = await askStaging(env, lang);
    const status = await readStatus(env.PACKS, env.PARTS_COMPAT, lang);
    decided = decideState({
      http: staging.http,
      body: staging.body,
      status,
      hasV3: false,
      now,
    });
  } catch {
    decided = { state: "try-later", reason: "status-unreadable" };
  }

  return countAndReply(env, lang, seenKey, {
    state: decided.state,
    reason: decided.reason,
    visitorReason,
    now,
  });
}

async function handleGet(env: Env): Promise<Response> {
  const requests: Array<{
    lang: string;
    count: number;
    state: RequestState;
    at: string;
  }> = [];

  let cursor: string | undefined;
  do {
    const page = await env.REQUESTS.list({ prefix: "req:", cursor });
    for (const key of page.keys) {
      const lang = key.name.slice("req:".length);
      const record = await readRecord(env.REQUESTS, lang);
      if (!record) continue;
      requests.push({
        lang,
        count: record.count,
        state: record.lastState,
        at: record.lastAt,
      });
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  requests.sort((a, b) => b.count - a.count || a.lang.localeCompare(b.lang));
  return json(
    200,
    { requests },
    { "Cache-Control": "public, max-age=30" },
  );
}

export async function handleRequests(
  request: Request,
  env: Env,
): Promise<Response> {
  if (request.method === "GET") {
    return handleGet(env);
  }
  if (request.method === "POST") {
    return handlePost(request, env);
  }
  return json(405, { error: "method not allowed" });
}

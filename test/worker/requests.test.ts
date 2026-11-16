import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../../src/worker/index";
import type { Env } from "../../src/worker/env";
import { fakeBucket, fakeFetcher, fakeKv } from "./fakes";

const COMPAT = "f2.0-u2.3.0-p6000230-q9-a12-t1";

function freshAt(): string {
  return new Date(Date.now() - 60 * 60 * 1000).toISOString();
}

function turnstileOkFetch(): typeof fetch {
  return async () =>
    Response.json({ success: true }) as unknown as Response;
}

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    ASSETS: fakeFetcher(() => new Response("assets")),
    PACKS: fakeBucket({
      [`status/${COMPAT}/pt-br.json`]: {
        body: JSON.stringify({ state: "running", at: freshAt() }),
      },
    }),
    REQUESTS: fakeKv(),
    STAGING: fakeFetcher(() =>
      Response.json({ state: "preparing" }, { status: 202 }),
    ),
    PARTS_COMPAT: COMPAT,
    TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
    TURNSTILE_SECRET: "test-secret",
    ...overrides,
  };
}

async function postRequest(
  env: Env,
  body: unknown,
  ip = "203.0.113.10",
): Promise<Response> {
  return worker.fetch(
    new Request("https://example.test/api/requests", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": ip,
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    env,
    {} as ExecutionContext,
  );
}

describe("/api/requests", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("counts the first request and reports preparing for a buildable language", async () => {
    vi.stubGlobal("fetch", turnstileOkFetch());
    const env = makeEnv();
    const response = await postRequest(env, {
      lang: "pt",
      token: "ok",
      reason: "need Portuguese",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      lang: "pt-br",
      state: "preparing",
      count: 1,
    });
  });

  it("dedupes a second post from the same address the same day without calling staging again", async () => {
    vi.stubGlobal("fetch", turnstileOkFetch());
    let stagingCalls = 0;
    const env = makeEnv({
      STAGING: fakeFetcher(() => {
        stagingCalls += 1;
        return Response.json({ state: "preparing" }, { status: 202 });
      }),
    });

    await postRequest(env, { lang: "pt", token: "ok" });
    const second = await postRequest(env, { lang: "pt", token: "ok" });

    expect(stagingCalls).toBe(1);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({
      lang: "pt-br",
      state: "preparing",
      count: 1,
    });
  });

  it("counts another address as a second request", async () => {
    vi.stubGlobal("fetch", turnstileOkFetch());
    const env = makeEnv();

    await postRequest(env, { lang: "pt", token: "ok" }, "203.0.113.10");
    const second = await postRequest(
      env,
      { lang: "pt", token: "ok" },
      "203.0.113.11",
    );

    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({
      lang: "pt-br",
      state: "preparing",
      count: 2,
    });
  });

  it("returns 429 on the 6th post in an hour", async () => {
    vi.stubGlobal("fetch", turnstileOkFetch());
    const env = makeEnv();
    const tags = ["aa", "ab", "ae", "af", "ak"];
    for (const lang of tags) {
      const res = await postRequest(
        env,
        { lang, token: "ok" },
        "198.51.100.7",
      );
      expect(res.status).toBe(200);
    }

    const sixth = await postRequest(
      env,
      { lang: "am", token: "ok" },
      "198.51.100.7",
    );
    expect(sixth.status).toBe(429);
    expect(sixth.headers.get("Retry-After")).toBeTruthy();
    expect(await sixth.json()).toEqual({ error: "too many requests" });
  });

  it("returns 403 when Turnstile fails and counts nothing", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ success: false }));
    const env = makeEnv();

    const response = await postRequest(env, { lang: "pt", token: "bad" });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "check failed" });

    vi.stubGlobal("fetch", turnstileOkFetch());
    const get = await worker.fetch(
      new Request("https://example.test/api/requests"),
      env,
      {} as ExecutionContext,
    );
    expect(await get.json()).toEqual({ requests: [] });
  });

  it("returns 400 for a bad language tag", async () => {
    vi.stubGlobal("fetch", turnstileOkFetch());
    const env = makeEnv();
    const response = await postRequest(env, { lang: "es_419", token: "ok" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "bad language" });
  });

  it("returns 400 when reason is longer than 280 characters after trim", async () => {
    vi.stubGlobal("fetch", turnstileOkFetch());
    const env = makeEnv();
    const response = await postRequest(env, {
      lang: "pt",
      token: "ok",
      reason: "x".repeat(281),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "bad request" });
  });

  it("stores the visitor reason but omits it from GET", async () => {
    vi.stubGlobal("fetch", turnstileOkFetch());
    const env = makeEnv();
    await postRequest(env, {
      lang: "pt",
      token: "ok",
      reason: "please add this",
    });

    const get = await worker.fetch(
      new Request("https://example.test/api/requests"),
      env,
      {} as ExecutionContext,
    );
    expect(get.status).toBe(200);
    expect(get.headers.get("Cache-Control")).toBe("public, max-age=30");
    const body = (await get.json()) as {
      requests: Array<Record<string, unknown>>;
    };
    expect(body.requests).toHaveLength(1);
    expect(body.requests[0]).toMatchObject({
      lang: "pt-br",
      count: 1,
      state: "preparing",
    });
    expect(body.requests[0]).toHaveProperty("at");
    expect(body.requests[0]).not.toHaveProperty("reasons");
    expect(body.requests[0]).not.toHaveProperty("reason");
  });

  it("answers available for a language already in the bucket and writes no KV record", async () => {
    vi.stubGlobal("fetch", turnstileOkFetch());
    let stagingCalls = 0;
    const env = makeEnv({
      PACKS: fakeBucket({
        "v3/catalog/en.seg": { body: "catalog" },
      }),
      STAGING: fakeFetcher(() => {
        stagingCalls += 1;
        return Response.json({ state: "preparing" }, { status: 202 });
      }),
    });

    const response = await postRequest(env, { lang: "en", token: "ok" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      lang: "en",
      state: "available",
      count: 0,
    });
    expect(stagingCalls).toBe(0);

    const get = await worker.fetch(
      new Request("https://example.test/api/requests"),
      env,
      {} as ExecutionContext,
    );
    expect(await get.json()).toEqual({ requests: [] });
  });

  it("counts try-later when staging throws", async () => {
    vi.stubGlobal("fetch", turnstileOkFetch());
    const env = makeEnv({
      STAGING: fakeFetcher(() => {
        throw new Error("staging down");
      }),
    });

    const response = await postRequest(env, { lang: "pt", token: "ok" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      lang: "pt-br",
      state: "try-later",
      reason: "staging-unreachable",
      count: 1,
    });
  });

  it("lists GET records sorted by count descending", async () => {
    vi.stubGlobal("fetch", turnstileOkFetch());
    const env = makeEnv();

    await postRequest(env, { lang: "aa", token: "ok" }, "203.0.113.1");
    await postRequest(env, { lang: "ab", token: "ok" }, "203.0.113.1");
    await postRequest(env, { lang: "ab", token: "ok" }, "203.0.113.2");

    const get = await worker.fetch(
      new Request("https://example.test/api/requests"),
      env,
      {} as ExecutionContext,
    );
    const body = (await get.json()) as {
      requests: Array<{ lang: string; count: number }>;
    };
    expect(body.requests.map((r) => ({ lang: r.lang, count: r.count }))).toEqual(
      [
        { lang: "ab", count: 2 },
        { lang: "aa", count: 1 },
      ],
    );
  });

  it("treats a throwing PACKS.head as try-later status-unreadable and still counts", async () => {
    vi.stubGlobal("fetch", turnstileOkFetch());
    const packs = fakeBucket({});
    packs.head = async () => {
      throw new Error("r2 head failed");
    };
    const env = makeEnv({ PACKS: packs });

    const response = await postRequest(env, { lang: "pt", token: "ok" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      lang: "pt-br",
      state: "try-later",
      reason: "status-unreadable",
      count: 1,
    });
  });

  it("treats a throwing readStatus (R2 get) as try-later status-unreadable and still counts", async () => {
    vi.stubGlobal("fetch", turnstileOkFetch());
    const packs = fakeBucket({});
    packs.head = async () => null;
    packs.get = async () => {
      throw new Error("r2 get failed");
    };
    const env = makeEnv({ PACKS: packs });

    const response = await postRequest(env, { lang: "pt", token: "ok" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      lang: "pt-br",
      state: "try-later",
      reason: "status-unreadable",
      count: 1,
    });
  });

  it("returns 400 for a non-JSON body", async () => {
    vi.stubGlobal("fetch", turnstileOkFetch());
    const env = makeEnv();
    const response = await postRequest(env, "not-json");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "bad request" });
  });
});

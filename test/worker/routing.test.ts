import { describe, expect, it } from "vitest";
import worker from "../../src/worker/index";
import type { Env } from "../../src/worker/env";
import { fakeBucket, fakeFetcher, fakeKv } from "./fakes";

function makeEnv(assets: Fetcher): Env {
  return {
    ASSETS: assets,
    PACKS: fakeBucket({}),
    REQUESTS: fakeKv(),
    STAGING: fakeFetcher(() => new Response("unused")),
    PARTS_COMPAT: "f2.0-u2.3.0-p6000230-q9-a12-t1",
    TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
    TURNSTILE_SECRET: "test-secret",
  };
}

describe("worker routing", () => {
  it("forwards GET / to ASSETS unchanged", async () => {
    const seen: string[] = [];
    const env = makeEnv(
      fakeFetcher((request) => {
        seen.push(request.url);
        return new Response("home");
      }),
    );

    const response = await worker.fetch(
      new Request("https://example.test/"),
      env,
      {} as ExecutionContext,
    );

    expect(seen).toEqual(["https://example.test/"]);
    expect(await response.text()).toBe("home");
  });

  it("forwards GET /format-3/try/ to ASSETS unchanged", async () => {
    const seen: string[] = [];
    const env = makeEnv(
      fakeFetcher((request) => {
        seen.push(request.url);
        return new Response("try");
      }),
    );

    const response = await worker.fetch(
      new Request("https://example.test/format-3/try/"),
      env,
      {} as ExecutionContext,
    );

    expect(seen).toEqual(["https://example.test/format-3/try/"]);
    expect(await response.text()).toBe("try");
  });

  it("returns 404 JSON for unknown API paths", async () => {
    const env = makeEnv(fakeFetcher(() => new Response("assets")));
    const response = await worker.fetch(
      new Request("https://example.test/api/nope"),
      env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({ error: "not found" });
  });

  it("returns 405 for unsupported methods on /api/languages", async () => {
    const env = makeEnv(fakeFetcher(() => new Response("assets")));
    const response = await worker.fetch(
      new Request("https://example.test/api/languages", { method: "PUT" }),
      env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(405);
  });
});

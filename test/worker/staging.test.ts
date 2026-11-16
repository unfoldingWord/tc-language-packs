import { describe, expect, it } from "vitest";
import type { Env } from "../../src/worker/env";
import { askStaging, readStatus } from "../../src/worker/staging";
import { fakeBucket, fakeFetcher, fakeKv } from "./fakes";

const COMPAT = "f2.0-u2.3.0-p6000230-q9-a12-t1";

function makeEnv(staging: Fetcher, packs: R2Bucket = fakeBucket({})): Env {
  return {
    ASSETS: fakeFetcher(() => new Response("assets")),
    PACKS: packs,
    REQUESTS: fakeKv(),
    STAGING: staging,
    PARTS_COMPAT: COMPAT,
    TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
    TURNSTILE_SECRET: "test-secret",
  };
}

describe("askStaging", () => {
  it("returns http null when the fetcher throws", async () => {
    const env = makeEnv(
      fakeFetcher(() => {
        throw new Error("boom");
      }),
    );
    await expect(askStaging(env, "es-419")).resolves.toEqual({
      http: null,
      body: null,
    });
  });

  it("returns body null for non-JSON responses", async () => {
    const env = makeEnv(
      fakeFetcher(
        () =>
          new Response("<html>nope</html>", {
            status: 502,
            headers: { "Content-Type": "text/html" },
          }),
      ),
    );
    await expect(askStaging(env, "es-419")).resolves.toEqual({
      http: 502,
      body: null,
    });
  });

  it("requests the exact packs path for the language", async () => {
    const seen: string[] = [];
    const env = makeEnv(
      fakeFetcher((request) => {
        seen.push(new URL(request.url).pathname);
        return Response.json({ state: "preparing" }, { status: 202 });
      }),
    );
    const result = await askStaging(env, "es-419");
    expect(seen).toEqual([`/v2/packs/${COMPAT}/es-419`]);
    expect(result).toEqual({ http: 202, body: { state: "preparing" } });
  });
});

describe("readStatus", () => {
  it("returns null when the status object is missing", async () => {
    await expect(readStatus(fakeBucket({}), COMPAT, "es-419")).resolves.toBe(
      null,
    );
  });

  it("returns null for invalid JSON", async () => {
    const bucket = fakeBucket({
      [`status/${COMPAT}/es-419.json`]: { body: "{" },
    });
    await expect(readStatus(bucket, COMPAT, "es-419")).resolves.toBe(null);
  });

  it("returns null when at is missing", async () => {
    const bucket = fakeBucket({
      [`status/${COMPAT}/es-419.json`]: {
        body: JSON.stringify({ state: "running" }),
      },
    });
    await expect(readStatus(bucket, COMPAT, "es-419")).resolves.toBe(null);
  });

  it("returns the status object when valid", async () => {
    const status = { state: "running", at: "2026-11-15T11:00:00Z" };
    const bucket = fakeBucket({
      [`status/${COMPAT}/es-419.json`]: { body: JSON.stringify(status) },
    });
    await expect(readStatus(bucket, COMPAT, "es-419")).resolves.toEqual(status);
  });
});

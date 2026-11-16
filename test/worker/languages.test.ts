import { describe, expect, it } from "vitest";
import worker from "../../src/worker/index";
import type { Env } from "../../src/worker/env";
import { listLanguages } from "../../src/worker/languages";
import { fakeBucket, fakeFetcher, fakeKv } from "./fakes";

function makeEnv(packs: R2Bucket): Env {
  return {
    ASSETS: fakeFetcher(() => new Response("assets")),
    PACKS: packs,
    REQUESTS: fakeKv(),
    STAGING: fakeFetcher(() => new Response("unused")),
    PARTS_COMPAT: "f2.0-u2.3.0-p6000230-q9-a12-t1",
    TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
    TURNSTILE_SECRET: "test-secret",
  };
}

describe("listLanguages", () => {
  it("lists format 3 catalogs with sizes, skips common and non-catalog keys", async () => {
    const enUploaded = new Date("2026-11-10T08:00:00Z");
    const esUploaded = new Date("2026-11-11T09:30:00Z");
    const bucket = fakeBucket({
      "v3/catalog/en.seg": { body: "en-catalog", uploaded: enUploaded },
      "v3/catalog/es-419.seg": { body: "es-catalog-bytes", uploaded: esUploaded },
      "v3/catalog/common.seg": { body: "common" },
      "v3/seg/abc.seg": { body: "segment" },
      "status/x/en.json": { body: '{"state":"ok"}' },
    });

    const languages = await listLanguages(bucket);

    expect(languages).toEqual([
      {
        lang: "en",
        size: new TextEncoder().encode("en-catalog").length,
        uploaded: enUploaded.toISOString(),
      },
      {
        lang: "es-419",
        size: new TextEncoder().encode("es-catalog-bytes").length,
        uploaded: esUploaded.toISOString(),
      },
    ]);
  });

  it("returns all languages when listing needs two pages", async () => {
    const bucket = fakeBucket({
      "v3/catalog/aa.seg": { body: "a" },
      "v3/catalog/bb.seg": { body: "b" },
      "v3/catalog/cc.seg": { body: "c" },
    });
    const originalList = bucket.list.bind(bucket);
    bucket.list = (options: R2ListOptions = {}) =>
      originalList({ ...options, limit: options.limit ?? 2 });

    const languages = await listLanguages(bucket);

    expect(languages.map((entry) => entry.lang)).toEqual(["aa", "bb", "cc"]);
  });

  it("returns an empty list for an empty bucket", async () => {
    expect(await listLanguages(fakeBucket({}))).toEqual([]);
  });

  it("skips keys under v3/catalog/ that do not end in .seg", async () => {
    const bucket = fakeBucket({
      "v3/catalog/en.seg": { body: "ok" },
      "v3/catalog/notes.txt": { body: "skip-me" },
      "v3/catalog/fr.seg.bak": { body: "skip-me-too" },
    });

    const languages = await listLanguages(bucket);

    expect(languages.map((entry) => entry.lang)).toEqual(["en"]);
  });
});

describe("GET /api/languages", () => {
  it("returns languages with a short public cache", async () => {
    const uploaded = new Date("2026-11-12T12:00:00Z");
    const env = makeEnv(
      fakeBucket({
        "v3/catalog/en.seg": { body: "en", uploaded },
        "v3/catalog/common.seg": { body: "common" },
      }),
    );

    const response = await worker.fetch(
      new Request("https://example.test/api/languages"),
      env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=60");
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({
      languages: [
        {
          lang: "en",
          size: new TextEncoder().encode("en").length,
          uploaded: uploaded.toISOString(),
        },
      ],
    });
  });

  it("answers only GET with 405 method not allowed for other methods", async () => {
    const env = makeEnv(fakeBucket({}));

    for (const method of ["POST", "PUT", "DELETE"] as const) {
      const response = await worker.fetch(
        new Request("https://example.test/api/languages", { method }),
        env,
        {} as ExecutionContext,
      );

      expect(response.status).toBe(405);
      expect(await response.json()).toEqual({ error: "method not allowed" });
    }
  });
});

import type { Env } from "./env";
import type { BuildStatus } from "./state";

const ASK_TIMEOUT_MS = 10_000;

const VALID_STATES = new Set(["running", "ok", "failed"]);

export async function askStaging(
  env: Env,
  lang: string,
): Promise<{ http: number | null; body: unknown }> {
  try {
    const response = await env.STAGING.fetch(
      new Request(`https://staging/v2/packs/${env.PARTS_COMPAT}/${lang}`, {
        signal: AbortSignal.timeout(ASK_TIMEOUT_MS),
      }),
    );
    const text = await response.text();
    try {
      return { http: response.status, body: JSON.parse(text) };
    } catch {
      return { http: response.status, body: null };
    }
  } catch {
    return { http: null, body: null };
  }
}

export async function readStatus(
  bucket: R2Bucket,
  compat: string,
  lang: string,
): Promise<BuildStatus | null> {
  const object = await bucket.get(`status/${compat}/${lang}.json`);
  if (!object) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(await object.text());
  } catch {
    return null;
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed)
  ) {
    return null;
  }

  const record = parsed as Record<string, unknown>;
  if (
    typeof record.state !== "string" ||
    !VALID_STATES.has(record.state) ||
    typeof record.at !== "string" ||
    Number.isNaN(Date.parse(record.at))
  ) {
    return null;
  }

  return {
    state: record.state as BuildStatus["state"],
    at: record.at,
  };
}

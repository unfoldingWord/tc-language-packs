import { describe, expect, it, vi } from "vitest";
import { decideState } from "../../src/worker/state";
import type { BuildStatus } from "../../src/worker/state";

const NOW = new Date("2026-11-15T12:00:00Z");

function base(overrides: {
  http?: number | null;
  body?: unknown;
  status?: BuildStatus | null;
  hasV3?: boolean;
  now?: Date;
}) {
  return decideState({
    http: overrides.http !== undefined ? overrides.http : 202,
    body: overrides.body ?? null,
    status: overrides.status === undefined ? null : overrides.status,
    hasV3: overrides.hasV3 ?? false,
    now: overrides.now ?? NOW,
  });
}

describe("decideState", () => {
  it("returns available when hasV3 regardless of other fields", () => {
    expect(
      base({
        hasV3: true,
        http: null,
        body: null,
        status: { state: "failed", at: "2026-11-15T11:00:00Z" },
      }),
    ).toEqual({ state: "available" });
  });

  it("returns preparing for 202 with fresh running status", () => {
    expect(
      base({
        http: 202,
        status: { state: "running", at: "2026-11-15T11:00:00Z" },
      }),
    ).toEqual({ state: "preparing" });
  });

  it("returns try-later for 202 with running status older than 5.5 h", () => {
    expect(
      base({
        http: 202,
        status: { state: "running", at: "2026-11-15T06:00:00Z" },
      }),
    ).toEqual({ state: "try-later" });
  });

  it("returns try-later for 202 with failed status", () => {
    expect(
      base({
        http: 202,
        status: { state: "failed", at: "2026-11-15T11:00:00Z" },
      }),
    ).toEqual({ state: "try-later" });
  });

  it("returns try-later for 202 with null status", () => {
    expect(base({ http: 202, status: null })).toEqual({ state: "try-later" });
  });

  it("returns no-content for 404 with no packs error", () => {
    expect(
      base({
        http: 404,
        body: { error: "no packs for this language" },
      }),
    ).toEqual({ state: "no-content" });
  });

  it("returns try-later with parts-off reason for 404 unavailable", () => {
    expect(
      base({
        http: 404,
        body: { state: "unavailable", reason: "parts-off" },
      }),
    ).toEqual({ state: "try-later", reason: "parts-off" });
  });

  it("returns try-later with old-compat reason and logs loudly", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(
      base({
        http: 404,
        body: { state: "unavailable", reason: "old-compat" },
      }),
    ).toEqual({ state: "try-later", reason: "old-compat" });
    expect(err).toHaveBeenCalledWith(
      "[catalog] PARTS_COMPAT is out of date",
    );
    err.mockRestore();
  });

  it("returns try-later with stopped reason for 503", () => {
    expect(
      base({
        http: 503,
        body: { reason: "stopped" },
      }),
    ).toEqual({ state: "try-later", reason: "stopped" });
  });

  it("returns try-later for 503 unavailable without reason", () => {
    expect(
      base({
        http: 503,
        body: { state: "unavailable" },
      }),
    ).toEqual({ state: "try-later" });
  });

  it("returns waiting-format-3 for 200 with ok status", () => {
    expect(
      base({
        http: 200,
        status: { state: "ok", at: "2026-11-15T11:00:00Z" },
      }),
    ).toEqual({ state: "waiting-format-3" });
  });

  it("returns preparing for 200 with fresh running status", () => {
    expect(
      base({
        http: 200,
        status: { state: "running", at: "2026-11-15T11:00:00Z" },
      }),
    ).toEqual({ state: "preparing" });
  });

  it("returns try-later with staging-unreachable when http is null", () => {
    expect(base({ http: null })).toEqual({
      state: "try-later",
      reason: "staging-unreachable",
    });
  });
});

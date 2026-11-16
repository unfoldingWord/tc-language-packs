export type RequestState =
  | "available"
  | "preparing"
  | "no-content"
  | "try-later"
  | "waiting-format-3";

export type BuildStatus = {
  state: "running" | "ok" | "failed";
  at: string;
};

/** Status older than this is not treated as an active build. */
const RUNNING_STALE_MS = 5.5 * 60 * 60 * 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function freshRunning(status: BuildStatus | null, now: Date): boolean {
  if (!status || status.state !== "running") return false;
  const atMs = Date.parse(status.at);
  if (Number.isNaN(atMs)) return false;
  return now.getTime() - atMs < RUNNING_STALE_MS;
}

export function decideState(o: {
  http: number | null;
  body: unknown;
  status: BuildStatus | null;
  hasV3: boolean;
  now: Date;
}): { state: RequestState; reason?: string } {
  if (o.hasV3) {
    return { state: "available" };
  }

  if (o.http === null) {
    return { state: "try-later", reason: "staging-unreachable" };
  }

  if (o.http === 404) {
    if (
      isRecord(o.body) &&
      o.body.error === "no packs for this language"
    ) {
      return { state: "no-content" };
    }
    if (
      isRecord(o.body) &&
      o.body.state === "unavailable" &&
      typeof o.body.reason === "string"
    ) {
      if (o.body.reason === "old-compat") {
        console.error("[catalog] PARTS_COMPAT is out of date");
      }
      return { state: "try-later", reason: o.body.reason };
    }
    return { state: "try-later" };
  }

  if (o.http === 503) {
    if (isRecord(o.body) && typeof o.body.reason === "string") {
      return { state: "try-later", reason: o.body.reason };
    }
    return { state: "try-later" };
  }

  if (o.http === 202) {
    if (freshRunning(o.status, o.now)) {
      return { state: "preparing" };
    }
    return { state: "try-later" };
  }

  if (o.http === 200) {
    if (freshRunning(o.status, o.now)) {
      return { state: "preparing" };
    }
    if (o.status?.state === "ok") {
      return { state: "waiting-format-3" };
    }
    return { state: "try-later" };
  }

  return { state: "try-later" };
}

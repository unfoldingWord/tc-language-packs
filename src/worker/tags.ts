const ALIASES: Record<string, string> = {
  es: "es-419",
  pt: "pt-br",
  zh: "zh-hans",
  ar: "ar-x-strong",
};

const TAG_PATTERN = /^[a-z]{2,3}(-[a-z0-9]{1,8})*$/;

export function normalizeTag(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;

  const aliased = ALIASES[trimmed] ?? trimmed;
  if (aliased === "common") return null;
  if (!TAG_PATTERN.test(aliased)) return null;
  return aliased;
}

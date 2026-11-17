export type LanguageEntry = {
  lang: string;
  size: number;
  uploaded: string;
};

const CATALOG_PREFIX = "v3/catalog/";
const CATALOG_SUFFIX = ".seg";

export async function listLanguages(bucket: R2Bucket): Promise<LanguageEntry[]> {
  const entries: LanguageEntry[] = [];
  let cursor: string | undefined;

  do {
    const page = await bucket.list({
      prefix: CATALOG_PREFIX,
      cursor,
    });

    for (const object of page.objects) {
      if (!object.key.endsWith(CATALOG_SUFFIX)) continue;
      const lang = object.key.slice(
        CATALOG_PREFIX.length,
        object.key.length - CATALOG_SUFFIX.length,
      );
      if (!lang || lang === "common") continue;
      entries.push({
        lang,
        size: object.size,
        uploaded: object.uploaded.toISOString(),
      });
    }

    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  entries.sort((a, b) => (a.lang < b.lang ? -1 : a.lang > b.lang ? 1 : 0));
  return entries;
}

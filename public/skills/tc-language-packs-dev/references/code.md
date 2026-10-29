# Building with language packs

Contents: read a manifest · open a pack · make packs · download parts · serve from views · use packs from an agent

The packages are TypeScript, in github.com/unfoldingWord/tc-study under `packages/`. They run in a browser on
IndexedDB and in Bun or Node with any store that has the same small interface. Servos (github.com/idiomaspuentes/servos,
`src/resources/`) is a complete app that uses all of this.

## Read what a pack brings

```ts
import { readPackManifest } from '@bt-synergy/language-pack'

const manifest = await readPackManifest(bytes)   // throws a readable error if not a pack, or newer than this reader
manifest.kind; manifest.books; manifest.requires
for (const r of manifest.resources) console.log(r.title, r.stamp, r.rows)
```

Compare each resource's `stamp` with your copy before replacing anything, and show people what changes.

## Open it into your stores

```ts
import { IndexedDBCacheAdapter } from '@bt-synergy/cache-adapter-indexeddb'
import { IndexedDBCatalogAdapter } from '@bt-synergy/catalog-adapter-indexeddb'
import { importLanguagePack, packTargetFrom } from '@bt-synergy/language-pack'

const stores = {
  cache: new IndexedDBCacheAdapter({ dbName: 'my-app-resources', storeName: 'cache-entries', version: 1 }),
  catalog: new IndexedDBCatalogAdapter({ dbName: 'my-app-catalog', storeName: 'catalog-entries' }),
}
const versions = {
  sot: { usjProcessing: USJ_PROCESSING_VERSION },            // @bt-synergy/usj-processor
  prepared: { scripturePrepare: SCRIPTURE_PREPARE_VERSION }, // @bt-synergy/resource-pipeline
  quote: { helpsQuote: HELPS_QUOTE_VERSION },
  align: { helpsAlign: HELPS_ALIGN_VERSION },
  text: { helpsText: HELPS_TEXT_VERSION },
  index: { helpsIndex: HELPS_INDEX_VERSION },                // only once your app reads the word index
}
const result = await importLanguagePack({
  bytes, target: packTargetFrom(stores), versions,
  overwrite: ['unfoldingWord/en/tn'],          // resources to replace; others the device has stay
  onProgress: (done, total) => {},
})
// result.manifest, result.written, result.keptExisting, result.byLayer
// result.skippedLayers      derived layers of another code version, not written
// result.skippedResources   [{ key, why }]: another release already here, not named in overwrite
// result.originals          [{ key, stamp, status: 'present' | 'in-pack' | 'missing' | 'other-release' }]
// result.droppedRows        quote and align rows of books whose original differs on this device (rebuilt there)
```

What a version difference does:

- `sot` or `receipt` differs: `importLanguagePack` throws and writes nothing. Those rows would be thrown away anyway;
  make the pack again with your code's versions.
- A derived layer differs (`prepared`, `quote`, `align`, `text`): that layer is skipped and listed in `skippedLayers`;
  rebuild it from the source rows, or say that part is missing.
- A layer your `versions` does not name is not compared. State every layer your app reads, so a mismatch cannot slip
  in unchecked. The `index` layer is the exception that proves the rule: it is opened only when you state its version.
- To see a pack's versions without opening it, read its manifest (`readPackManifest`, or `langpack.py info`, which
  prints the compatibility key) and compare with your constants.

Receipts are written last per resource, so a pack cut short never marks a resource complete; opening it again fills
what is missing. Open the originals pack first.

## Make packs

In a clone of tc-study with `bun install`:

```bash
bun packages/resource-pipeline/cli/prepare-language.ts --lang es-419 --out ./packs --books all   # a small language
#   --books all|tit,rut   also a base pack and one pack per book
#   --no-originals        --macula <folder>   --no-lexicons   --lexicons-ref <ref>   --no-obs
```

It discovers what Door43 marks `tc-ready` for the language (any owner), downloads it whole, builds every derived
row with tC Study's own code, and writes `{lang}.langpack.zip`, `originals.langpack.zip`, `{lang}-base…`,
`{lang}-{book}…` and `{lang}.report.json`. A large language such as English does not fit in one process: build it as
parts, one book at a time (`packages/resource-pipeline/cli/publish-language.ts --parts --lang en --work <folder>
--no-upload`; the GitHub workflow `language-packs.yml` publishes them). From stores an app already filled:

```ts
import { buildLanguagePack, packSourceFrom } from '@bt-synergy/language-pack'
const { bytes, manifest, skipped } = await buildLanguagePack({ source: packSourceFrom(stores), language: 'en', kind: 'book', books: ['tit'], versions })
```

## Download parts

```
GET https://tc-helps.mcp.servant.bible/v2/packs/{compat}/{lang}                 the parts list (ETag; 304)
GET https://tc-helps.mcp.servant.bible/v2/packs/{compat}/originals/{sha256}     the originals list it names
GET https://tc-helps.mcp.servant.bible/v2/packs/parts/{sha256}                  one part (immutable, Range allowed)
```

`{compat}` is the parts compat key (`f2.0-u2.3.0-p6000230-q9-a12-t1` in October 2026). Answers: `200` + `ETag`;
`304`; `202 {"state":"preparing"}` with `Retry-After`; `404 {"reason":"old-compat"}` (update the app); `404` no packs
for the language; `429` and `503` with `Retry-After`. Check each part's sha256 before keeping it.

```ts
import { IndexedDBByteStore } from '@bt-synergy/cache-adapter-indexeddb'
import { REGISTER_PREFIX, applyParts, packTargetFrom, planParts, readRegister, stagingFrom } from '@bt-synergy/language-pack'

const staging = stagingFrom(new IndexedDBByteStore({ dbName: 'my-app-parts' }))
const register = readRegister(await stores.cache.getByPrefix(REGISTER_PREFIX))
const chosen = ['shared', 'book tit']
const plan = planParts({ list, originals, register, chosen, versions })
for (const part of plan.download) await staging.put(part.sha256, await download(part))
const result = await applyParts({ target: packTargetFrom(stores), staging, plan, list, originals, register, chosen, versions })
```

Pass the same `versions` to both calls. Run the sequence at startup with nothing to download: it heals what an
interrupted run left.

## Serve from views

A server does not need IndexedDB. `packages/resource-pipeline/cli/mcp-views.ts` writes plain JSON per chapter from a
pack, which translation-helps-mcp reads through a one-method interface (`src/api/routes/packViews.ts`):

```
v1/{lang}/index.json
v1/{lang}/notes/{BOOK}/{ch}.json        notes with supportReferenceTitle and aligned.literal / aligned.simple
v1/{lang}/word-links/{BOOK}/{ch}.json
v1/{lang}/questions/{BOOK}/{ch}.json
```

```ts
export interface PackViews { get(path: string): Promise<unknown | null> }   // an R2 bucket in a Worker, a folder in a script
```

Views have their own schema (`schema: 1`), which does not change when the code that prepares packs does.

## Use packs from an agent

`scripts/langpack.py` in this skill reads packs and parts in place with the Python standard library, and answers
verses, alignments, notes, questions, links, articles, lexicon entries and occurrences across books, as text or JSON.
An MCP server or tool can shell out to it, or port its functions (each is short and commented).

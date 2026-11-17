# tc-catalog Implementation Plan

> **For agentic workers:** this is unfoldingWord work. Per Abel's rules, Cursor implements each task from a brief
> (`bt-servant-workspace/handoff/tareas/T-NNN-*.md`, written by Claude from this plan) and Claude reviews it. Steps use
> checkbox (`- [ ]`) syntax for tracking. Nothing is pushed, deployed or created in Cloudflare without Abel's yes.

**Goal:** A `catalog/` page in tc-language-packs where a person downloads a format 3 language (chosen books) as one
`.tcpack` file to share, and asks for a missing language, with a per-language request counter.

**Architecture:** The tc-language-packs Worker, which today only serves `public/`, gains a TypeScript script that
answers `/api/*` and lets every other path fall through to the static assets. `/api/languages` lists format 3
catalogs from the staging bucket (read only); `/api/requests` asks the staging packs Worker for a build through a
service binding, reads the build status from the bucket, and counts requests in KV. The page builds the `.tcpack` in
the browser with the client library already bundled for `format-3/try/`.

**Tech Stack:** Cloudflare Workers (static assets + script), R2, KV, service binding, Turnstile; TypeScript, vitest;
plain HTML/CSS/ES modules for the page; `@bt-synergy/language-pack-client` (bundled `language-pack-client.js`).

**Spec:** `docs/superpowers/specs/2026-11-15-tc-catalog-design.md` (read it with this plan).

**Repo and branch:** `unfoldingWord/tc-language-packs`, branch `feat/tc-catalog` from `docs/tc-catalog-design`
(which holds the spec and this plan).

## Global Constraints

- Staging only: page server `https://translation-helps-mcp-v2-preview.unfoldingword.workers.dev`, trusted key
  `78d2e6299a2de4d0`, bucket `language-packs-staging`, service `translation-helps-mcp-v2-preview`. Production is not
  touched.
- `PARTS_COMPAT = "f2.0-u2.3.0-p6000230-q9-a12-t1"` (a Worker var, not code).
- Tag pattern after lowercasing and aliases: `^[a-z]{2,3}(-[a-z0-9]{1,8})*$`. Aliases: `es→es-419`, `pt→pt-br`,
  `zh→zh-hans`, `ar→ar-x-strong`.
- `preparing` only when `status/{PARTS_COMPAT}/{lang}.json` says `running` and its `at` is younger than 5.5 h.
- No secrets in the repository. `TURNSTILE_SECRET` is a Worker secret; the site key is a var. KV namespace id stays a
  placeholder until Abel creates it.
- No personal data kept: no e-mail; addresses only as SHA-256 hashes in expiring rate-limit keys; the visitor's reason
  is trimmed to 280 characters, the last 5 kept per language, never returned by any route.
- Every existing page (`/`, `inside/`, `build/`, `format-3/`, `format-3/try/`, `skills/`, `llms.txt`) is served
  exactly as before.
- Commits in English with a why. Commits local only.

## Review Focus

1. A tag typed as `ES`, ` es-419 `, `es_419` or `pt` → normalized (`es-419`, `es-419`, 400, `pt-br`); a bad tag gets
   400 with a plain message, never a 500. Test in Task 1.
2. The staging Worker throws, times out or answers non-JSON → state `try-later`, request still counted, no 500.
   Test in Task 3.
3. The status file is missing, not JSON, or has no/invalid `at` → treated as not running (`try-later` on a 202).
   Test in Task 3.
4. A listed language whose catalog then fails (404 or `E_SIGNATURE`) → shown as not available now, no download
   button. Pure test in Task 5 (`catalogProblemText`), manual check in Task 5.
5. A download that stops halfway (network, storage quota) → plain message, what is complete is kept, the button works
   again; no partial `.tcpack` offered. Manual check in Task 6, `downloadErrorText` test in Task 6.

---

## File structure

| File | Responsibility |
| --- | --- |
| `package.json`, `tsconfig.json`, `vitest.config.ts` | dev tooling only (wrangler, vitest, typescript, @cloudflare/workers-types) |
| `wrangler.jsonc` | adds `main`, `assets.binding` + `run_worker_first: ["/api/*"]`, R2 `PACKS`, KV `REQUESTS`, service `STAGING`, vars |
| `src/worker/index.ts` | routing; non-`/api/` → `env.ASSETS.fetch` |
| `src/worker/env.ts` | `Env` type |
| `src/worker/tags.ts` | tag normalization |
| `src/worker/languages.ts` | `/api/languages` |
| `src/worker/state.ts` | pure: build answer + status → request state |
| `src/worker/staging.ts` | calls staging, reads status file |
| `src/worker/requests.ts` | `/api/requests` GET/POST, Turnstile, rate limit, KV records |
| `test/worker/*.test.ts` | vitest with in-memory fakes of R2, KV and the service binding |
| `public/catalog/index.html`, `catalog.css` | the page |
| `public/catalog/catalog.js` | page wiring (DOM, client library) |
| `public/catalog/view.js` | pure helpers (texts, sizes, file name), tested with vitest |
| `public/format-3/try/language-pack-client.js` | rebuilt from tc-study master; imported by both pages |
| `public/index.html`, `README.md` | link to tc-catalog; README section |

`src/langpack.py` stays where it is.

---

### Task 1: Worker scaffold, routing and tags

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `src/worker/index.ts`, `src/worker/env.ts`,
  `src/worker/tags.ts`, `test/worker/tags.test.ts`, `test/worker/routing.test.ts`, `test/worker/fakes.ts`
- Modify: `wrangler.jsonc`

**Interfaces:**
- Produces: `type Env = { ASSETS: Fetcher; PACKS: R2Bucket; REQUESTS: KVNamespace; STAGING: Fetcher; PARTS_COMPAT: string; TURNSTILE_SITE_KEY: string; TURNSTILE_SECRET: string }`
- Produces: `normalizeTag(raw: string): string | null`
- Produces: `json(status: number, body: unknown, headers?: HeadersInit): Response` (in `index.ts`, exported; sets
  `Content-Type: application/json`, `Cache-Control: no-store` unless given)
- Produces: `fakeBucket(objects: Record<string, {body: string; uploaded?: Date}>)`, `fakeKv()`, `fakeFetcher(handler)`
  in `test/worker/fakes.ts`

- [ ] **Step 1: Write the failing tests**

`tags.test.ts`: `normalizeTag('ES') === 'es-419'`, `normalizeTag(' es-419 ') === 'es-419'`,
`normalizeTag('pt') === 'pt-br'`, `normalizeTag('zh') === 'zh-hans'`, `normalizeTag('ar') === 'ar-x-strong'`,
`normalizeTag('en') === 'en'`, `normalizeTag('es_419') === null`, `normalizeTag('common') === null`,
`normalizeTag('') === null`, `normalizeTag('a'.repeat(40)) === null`.

`routing.test.ts`: `GET /` and `GET /format-3/try/` reach `ASSETS` unchanged (fake fetcher records the URL);
`GET /api/nope` → 404 JSON `{"error":"not found"}`; `PUT /api/languages` → 405.

- [ ] **Step 2: Run** `npx vitest run test/worker` — Expected: FAIL (modules missing).
- [ ] **Step 3: Implement** `tags.ts` (lowercase + trim, alias map from Global Constraints, then the pattern; reject
  `common`) and `index.ts` (route table for `/api/languages` and `/api/requests`, filled by later tasks; others to
  `env.ASSETS.fetch(request)`). `wrangler.jsonc`: `main: "src/worker/index.ts"`, `assets: { directory: "public",
  binding: "ASSETS", run_worker_first: ["/api/*"] }`, `r2_buckets: [{binding: "PACKS", bucket_name:
  "language-packs-staging"}]`, `kv_namespaces: [{binding: "REQUESTS", id: "<set by Abel>"}]`, `services: [{binding:
  "STAGING", service: "translation-helps-mcp-v2-preview"}]`, `vars: {PARTS_COMPAT, TURNSTILE_SITE_KEY:
  "1x00000000000000000000AA"}` (Turnstile's public always-pass test key until Abel creates the real one).
- [ ] **Step 4: Run** `npx vitest run test/worker` and `npx tsc --noEmit` — Expected: PASS, no type errors.
- [ ] **Step 5: Smoke** `npx wrangler dev` then open `/`, `/format-3/try/`, `/llms.txt` — Expected: same pages as
  before.
- [ ] **Step 6: Commit** `feat(worker): add an API script in front of the static site`

### Task 2: `GET /api/languages`

**Files:** Create `src/worker/languages.ts`, `test/worker/languages.test.ts`; modify `src/worker/index.ts`.

**Interfaces:**
- Produces: `type LanguageEntry = { lang: string; size: number; uploaded: string }` (ISO time)
- Produces: `listLanguages(bucket: R2Bucket): Promise<LanguageEntry[]>`, sorted by `lang`
- Route answer: `200 { languages: LanguageEntry[] }`, `Cache-Control: public, max-age=60`

- [ ] **Step 1: Write the failing tests:** bucket with `v3/catalog/en.seg`, `v3/catalog/es-419.seg`,
  `v3/catalog/common.seg`, `v3/seg/abc.seg`, `status/x/en.json` → `[en, es-419]` with sizes; listing that needs two
  pages (`truncated` + `cursor`) returns all; empty bucket → `[]`; a key not ending in `.seg` is skipped.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** with `bucket.list({ prefix: 'v3/catalog/', cursor })` until not truncated.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(worker): list the format 3 languages from the staging bucket`

### Task 3: Request state from staging and the build status

**Files:** Create `src/worker/state.ts`, `src/worker/staging.ts`, `test/worker/state.test.ts`,
`test/worker/staging.test.ts`.

**Interfaces:**
- Produces: `type RequestState = 'available' | 'preparing' | 'no-content' | 'try-later' | 'waiting-format-3'`
- Produces: `type BuildStatus = { state: 'running' | 'ok' | 'failed'; at: string }`
- Produces: `decideState(o: { http: number | null; body: unknown; status: BuildStatus | null; hasV3: boolean; now: Date }): { state: RequestState; reason?: string }` — pure. `http: null` means the call failed.
- Produces: `askStaging(env: Env, lang: string): Promise<{ http: number | null; body: unknown }>` — `GET
  https://staging/v2/packs/${PARTS_COMPAT}/${lang}` through `env.STAGING`, 10 s timeout; any throw or non-JSON body
  → `{ http: null | status, body: null }`.
- Produces: `readStatus(bucket: R2Bucket, compat: string, lang: string): Promise<BuildStatus | null>` — `null` when
  missing, not JSON, or `state` / `at` invalid.

- [ ] **Step 1: Write the failing tests** for `decideState` (`now = 2026-11-15T12:00:00Z`):
  - `hasV3` → `available` whatever else.
  - `202` + status `running` at `11:00Z` → `preparing`.
  - `202` + status `running` at `06:00Z` (6 h) → `try-later`.
  - `202` + status `failed` → `try-later`; `202` + `null` status → `try-later`.
  - `404` + `{error:"no packs for this language"}` → `no-content`.
  - `404` + `{state:"unavailable",reason:"parts-off"}` → `try-later`, reason `parts-off`; same for `old-compat`.
  - `503` + `{reason:"stopped"}` → `try-later`, reason `stopped`; `503` + `{state:"unavailable"}` → `try-later`.
  - `200` + status `ok` → `waiting-format-3`; `200` + status `running` (fresh) → `preparing`.
  - `http: null` → `try-later`, reason `staging-unreachable`.

  For `staging.ts`: fake fetcher that throws → `{http:null}`; returns `text/html` → `body: null`; URL requested is
  exactly `/v2/packs/f2.0-u2.3.0-p6000230-q9-a12-t1/es-419`. `readStatus`: missing → `null`; `"{"` → `null`;
  `{state:"running"}` without `at` → `null`; valid → object.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** both files. On `404 old-compat`, `console.error('[catalog] PARTS_COMPAT is out of date')`.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(worker): tell a real build from a held one when a language is asked for`

### Task 4: `/api/requests` (POST and GET)

**Files:** Create `src/worker/requests.ts`, `test/worker/requests.test.ts`; modify `src/worker/index.ts`.

**Interfaces:**
- Consumes: `normalizeTag`, `listLanguages` (or `PACKS.head('v3/catalog/{lang}.seg')` for `hasV3`), `askStaging`,
  `readStatus`, `decideState`, `json`.
- Produces: KV key `req:{lang}` → `RequestRecord = { count: number; lastState: RequestState; lastReason?: string; lastAt: string; reasons: string[] }`
- Produces: `POST /api/requests` body `{ lang: string; reason?: string; token: string }` →
  `200 { lang, state, reason?, count }`; `400 {error:"bad language"}`; `400 {error:"bad request"}` (not JSON, reason
  over 280 chars after trim); `403 {error:"check failed"}` (Turnstile); `429 {error:"too many requests"}` with
  `Retry-After`.
- Produces: `GET /api/requests` → `200 { requests: { lang, count, state, at }[] }` sorted by count desc, no `reasons`,
  `Cache-Control: public, max-age=30`.
- Produces: `verifyTurnstile(secret: string, token: string, ip: string | null, fetcher?: typeof fetch): Promise<boolean>`
  (POST to `https://challenges.cloudflare.com/turnstile/v0/siteverify`).

Rate limit: key `rl:{sha256(ip)}:{hour}` (TTL 3600), at most 5 posts an hour. Dedupe: key
`seen:{sha256(ip)}:{lang}:{day}` (TTL 86400): a repeat that day answers the current record without counting. An
`available` language answers `available` and counts nothing. The KV counter is read-modify-write and may lose a count
under concurrent posts; that is accepted (spec: a counter, not a ledger).

- [ ] **Step 1: Write the failing tests:** first request for `pt` (staging fake: 202, status running fresh) →
  `{lang:"pt-br", state:"preparing", count:1}`; second post same address same day → `count:1`, staging not called
  again; another address → `count:2`; 6th post in an hour → 429; Turnstile fake false → 403, nothing counted;
  `lang:"es_419"` → 400; `reason` of 281 chars → 400; `reason` stored but absent from `GET`; `en` present in bucket →
  `available`, no KV write; staging fake throws → `try-later`, counted; `GET` lists records sorted by count.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** IP from `CF-Connecting-IP`; `reasons` keeps the last 5.
- [ ] **Step 4: Run** — PASS. Also `npx tsc --noEmit`.
- [ ] **Step 5: Commit** `feat(worker): take language requests, start buildable ones and count them`

### Task 5: Page — list languages and show a catalog

**Files:** Create `public/catalog/index.html`, `catalog.css`, `catalog.js`, `view.js`, `test/page/view.test.ts`;
modify `public/format-3/try/language-pack-client.js` (rebuilt), `README.md` (bundle commit).

**Interfaces:**
- Consumes: `/api/languages`; `createClient`, `httpSource`, `indexedDbStore`, `memoryStore` from
  `../format-3/try/language-pack-client.js`; the trust setup and `SHARED_UNITS` as in `format-3/try/index.html`
  (lines ~240–270).
- Produces in `view.js`: `formatSize(bytes: number): string` (`"812 KB"`, `"1.4 MB"`, `"2.1 GB"`, 1024 base),
  `bookList(status): { code: string; bytes: number }[]` (units whose key ends in `/book:XXX`),
  `catalogProblemText(err): string`.

- [ ] **Step 1: Rebuild the bundle** from tc-study master:
  `bun build packages/language-pack-client/src/index.ts --target=browser --format=esm --minify --outfile language-pack-client.js`,
  copy it over, update the commit hash in the README. Check `format-3/try/` still installs a book (manual).
- [ ] **Step 2: Write failing `view.test.ts`:** `formatSize(831488) === '812 KB'`, `formatSize(1468006) === '1.4 MB'`;
  `bookList` on a status with `es-419/book:tit` and `common/map` returns only `tit`;
  `catalogProblemText({code:'E_SIGNATURE'})` says the signature did not check and nothing is installed;
  `catalogProblemText({status:404})` says the language is not available right now.
- [ ] **Step 3: Run** `npx vitest run test/page` — FAIL.
- [ ] **Step 4: Implement** `view.js`, then the page: search box filtering the list; opening a language calls
  `client.refresh(lang)` then `client.status(lang)` and shows resources, books with sizes, revision and "signature
  checked"; on error, `catalogProblemText` and no download button. Style from `site.css`, as the other pages.
- [ ] **Step 5: Run** vitest — PASS. Manual: `npx wrangler dev`, open `/catalog/`, `en` and `es-419` listed, Titus
  size shown, signature line shown.
- [ ] **Step 6: Commit** `feat(catalog): list the format 3 languages and show what each one has`

### Task 6: Page — download a `.tcpack`

**Files:** Modify `public/catalog/catalog.js`, `view.js`, `index.html`; test `test/page/view.test.ts`.

**Interfaces:**
- Consumes: `client.install(lang, { books, defaults: true, units: SHARED_UNITS }, { onProgress })`,
  `client.exportTransfer({ lang, mode: 'full', books })`.
- Produces in `view.js`: `transferName(lang: string, books: string[], date: Date): string` →
  `es-419-tit-2026-11-15.tcpack`, `es-419-3-books-2026-11-15.tcpack`, `es-419-all-2026-11-15.tcpack` (all books);
  `needsSizeWarning(bytes: number): boolean` (`> 200 * 1024 * 1024`); `downloadErrorText(err): string`.

- [ ] **Step 1: Write failing tests** for the three `transferName` cases, `needsSizeWarning` at 200 MiB and 200 MiB + 1,
  `downloadErrorText({name:'QuotaExceededError'})` mentions browser storage, `downloadErrorText(new TypeError('Failed to fetch'))`
  mentions the connection and that what is complete is kept.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement:** book checkboxes (default none checked, "whole language" toggle), total size of the choice,
  `confirm()` when `needsSizeWarning`; progress bar; after install, `exportTransfer`, then a `Blob` download with
  `transferName`. On any error: `downloadErrorText`, button enabled again, no file offered.
- [ ] **Step 4: Run** vitest — PASS. Manual: download Titus for `es-419`; import the file with
  `client.importTransfer` in a fresh browser profile (or tc-study's `transfer-v3.ts import`) — Expected: Titus active.
  Disconnect mid-download — Expected: message, retry works.
- [ ] **Step 5: Measure** whole `es-419` on an Android phone (Chrome): time, peak memory or failure. Record it in the
  status report; if it fails, say at what size.
- [ ] **Step 6: Commit** `feat(catalog): download the chosen books as one transfer file to share`

### Task 7: Page — request form, counter, links and docs

**Files:** Modify `public/catalog/index.html`, `catalog.js`, `view.js`, `public/index.html`, `README.md`; test
`test/page/view.test.ts`.

**Interfaces:**
- Consumes: `POST /api/requests`, `GET /api/requests`. The page reads the Turnstile site key from
  `<meta name="turnstile-site-key" content="1x00000000000000000000AA">` (the public test key); the real key replaces
  it at deploy, with Abel's yes.
- Produces in `view.js`: `requestStateText(state: RequestState, reason?: string): string`.

- [ ] **Step 1: Write failing tests:** `requestStateText` for each state. Exact copy:
  - `available`: "This language is already here. Pick it in the list above."
  - `preparing`: "It is being prepared now. Come back in a few hours."
  - `no-content`: "Door43 has no resources in this language yet, so there is nothing to prepare. Your request is counted."
  - `try-later`: "Asked for. It cannot be prepared right now; it will be tried again later. Your request is counted."
  - `waiting-format-3`: "This language exists in the older format; the new one is still pending. Your request is counted."
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement:** form (language code, optional reason up to 280 chars, Turnstile widget from
  `https://challenges.cloudflare.com/turnstile/v0/api.js`), answer shown with `requestStateText`; counter list
  "Asked for" from `GET /api/requests` (language, count, state text). Landing page link to `catalog/`. README section
  "tc-catalog": what it does, the Worker routes, bindings, vars, the secret, and the resources Abel must create before
  the first deploy (KV namespace, Turnstile widget and secret).
- [ ] **Step 4: Run** vitest — PASS. Manual with `wrangler dev` (KV local, staging via `--remote` service binding only
  with Abel's yes; otherwise the fake): request `xyz` → `no-content`; request `en` → `available`.
- [ ] **Step 5: Commit** `feat(catalog): ask for a missing language and see who else asked`

## After the tasks (Claude and Abel, not Cursor)

- Claude reviews each task (PROTOCOLO), then the whole branch.
- With Abel's yes: create the KV namespace and the Turnstile widget, set `TURNSTILE_SECRET`, replace the placeholders,
  `wrangler deploy`, push and open the PR.

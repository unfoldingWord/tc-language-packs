# tc-catalog: download language packs to share, and ask for new ones

Date: 2026-11-15. Status: draft for Abel's approval. Owner: unfoldingWord (Cursor writes the code, Claude plans and
reviews, per Abel's rules for uW work).

## Intent

A person who wants to take a language with them and pass it on (SD card, USB, Bluetooth, to someone offline) opens
**tc-catalog**, picks a language and the books they need, and leaves with one file they can share: a format 3 transfer
file (`.tcpack`, `packages/language-pack-v3/spec/transfer.md` in unfoldingWord/tc-study).

When their language is not there, they ask for it. If Door43 has the resources, the build starts by itself; if not, the
request is counted, and the page shows how many people asked for each language.

## Goals

- A page `catalog/` (title "tc-catalog") in the tc-language-packs site, linked from the landing page.
- It lists the languages that have a format 3 catalog, and for each one: its resources, its books with their sizes, the
  catalog revision, and whether the publisher signature checks.
- The visitor chooses books (or the whole language) and downloads one `.tcpack` built in the browser.
- The visitor asks for a language that is missing. A buildable language starts building with no human in between.
- The page shows, per language asked for, how many requests there were and what state it is in (preparing, no content
  in Door43, try again later).

## Non-goals

- No new site or domain. tc-catalog is a section of tc-language-packs.
- No production. Format 3 is off in production (`404 v3-off`); the page reads staging and trusts the staging key
  `78d2e6299a2de4d0`, as `format-3/try/` does. Pointing at production is a later change.
- No change in translation-helps-mcp (C4 is in progress there, in `wt/th-c4`) and no change in `serving.md`.
- No format 2.0 downloads. Only format 3.
- No accounts, no admin page, no notifications. Nobody is told about requests; the counter on the page is the whole
  follow-up for now (Abel's call).
- No storing of personal data: a request carries a language code and, optionally, a short free-text reason. No e-mail.

## Anti-goals

- A request button that anyone can use to burn builds or fill storage without limit.
- A downloaded file the receiving app cannot import, or that contains a catalog whose signature does not check.
- A page that says a language is "coming" when nothing was dispatched.

## What exists today

- **tc-language-packs** (`unfoldingWord/tc-language-packs`, local checkout `language-packs-site`): a Worker that only
  serves static assets (`wrangler.jsonc` has `assets.directory = public`, no `main`). No build step. `public/format-3/try/`
  downloads a language from the staging Worker into IndexedDB with `language-pack-client.js` (the client library packed
  into one file) and verifies catalogs against the staging key.
- **The staging packs Worker** (`translation-helps-mcp-v2-preview.unfoldingword.workers.dev`) serves
  `/v3/packs/{lang}/catalog`, `/v3/packs/common/catalog`, `/v3/packs/seg/{id}` (`serving.md`). There is no route that
  lists languages.
- **Its `/v2/packs/{compat}/{lang}` route already does the request logic** (`src/api/routes/packs.ts` in
  translation-helps-mcp): it checks in Door43 whether the language is eligible (`404 not-eligible` when not), and for a
  missing pack asks the tc-study `language-packs.yml` workflow for a build through its GitHub App, behind a guard
  (`src/packs/dispatch.ts`): no second dispatch while running, 24 h cool-down after a failure, stop after 3 failures,
  a daily cap. It answers `202 {"state":"preparing"}` when a build is on its way, and `503 {"state":"unavailable",
  "reason": …}` (`capped`, `cooling`, `stopped`, …) otherwise. Staging has `PACKS_PARTS_DISPATCH = on`, and format 3
  is built in the same run as the format 2.0 parts (`serving.md`, "Errors"), so a parts request is what makes a
  format 3 catalog appear.
- **The packs bucket** `language-packs-staging` (R2) holds format 3 under `v3/`: `v3/catalog/{lang}.seg`,
  `v3/catalog/common.seg`, `v3/seg/{id}.seg`.
- **The client library** `@bt-synergy/language-pack-client` (tc-study `packages/language-pack-client`) verifies and
  installs catalogs and segments into a `BlobStore`, and has `exportTransfer` / `importTransfer`
  (`src/transfer.ts`).

## Approaches considered

- **A. Everything in the tc-language-packs Worker (chosen).** Add a Worker script next to the static assets with a
  read-only binding to the staging bucket (to list languages) and a KV namespace (for request counts). The page builds
  the `.tcpack` in the browser. No change in translation-helps-mcp, no conflict with C4, no spec change. Cost: the site
  is tied to the bucket (read only) and must run in the Cloudflare account that owns it.
- **B. A `GET /v3/packs/index` route in translation-helps-mcp.** Cleaner for other clients (Servos, the MCP), but it is
  a change of the serving contract, another deploy of that Worker, and it lands next to C4 while C4 is open. If another
  app needs the list later, tc-catalog moves to it by changing one URL.
- **C. A fixed list in the site.** Rejected: it goes stale with every build, and a requested language would not appear
  by itself.

Abel picked A on 2026-11-15.

## Design

### Parts

1. **Worker script** (`src/worker.ts` or similar in tc-language-packs; `wrangler.jsonc` gains `main`, an R2 binding to
   `language-packs-staging`, a KV namespace, and the Turnstile secret as a Worker secret). Requests that are not
   `/api/…` fall through to the static assets, so every existing page keeps working unchanged.
2. **`GET /api/languages`**: lists `v3/catalog/` in the bucket (excluding `common.seg`), and returns the language tags
   with each catalog's size and upload time. It does not decode catalogs: the page fetches and verifies each catalog it
   shows from the staging Worker with the client library, so trust comes from the signature, not from this route.
   Short cache (a minute or so).
3. **`POST /api/requests`** with `{ lang, reason?, turnstileToken }`:
   - checks the Turnstile token, a per-address rate limit, the tag against `^[a-z]{2,3}(-[a-z0-9]{1,8})*$` (after
     lowercasing), and the length of `reason`;
   - if the language already has a format 3 catalog, answers "already available" and counts nothing;
   - otherwise calls `GET /v2/packs/{PARTS_COMPAT}/{lang}` on the staging Worker, then reads the build status the
     workflow keeps in the same bucket, `status/{PARTS_COMPAT}/{lang}.json` (`{state, at, failures, run}`,
     `dispatch.ts`), and decides the state from both. Staging's own answer is not enough: it returns the same
     `202 {"state":"preparing"}` for `dispatched`, `running`, `cooling` and `capped` (`PREPARING` in
     `routes/packs.ts`), and two of those dispatched nothing.
     - `preparing` (shown as "being prepared"): only when the status file says `running` and is younger than 5.5 h
       (`RUNNING_STALE_MS`).
     - `no-content`: `404 not-eligible` (Door43 has no resources for it).
     - `try-later`: a `202` whose status is not `running` (cooling after a failure, or the day's cap is used up), any
       `503` (`stopped`, `error`, `eligibility-unknown`, …), `404 parts-off` or `404 old-compat`, and anything else.
       The page says "asked for; it will be tried again later" and does not say it is coming.
     - `waiting-format-3`: a `200` (format 2.0 parts exist) and a status `ok`, but no format 3 catalog. A request
       does not start a build then (staging only rebuilds stale parts). The page says the language exists in the
       older format and format 3 is pending; the count still goes up, which is the signal for a person.
   - increments the count for that language in KV and stores the last state and time.
   `PARTS_COMPAT` is a Worker variable (today `f2.0-u2.3.0-p6000230-q9-a12-t1`, `CURRENT_PARTS_COMPAT` in
   translation-helps-mcp). A `404 old-compat` answer means the variable is out of date: logged loudly.
   The call to the staging Worker goes through a **service binding** to `translation-helps-mcp-v2-preview` (both
   Workers are in the same Cloudflare account, `5a3ffd86…`, checked 2026-11-15); a plain `fetch` to another
   `workers.dev` Worker of the same account is blocked.
   **Language tags:** before the "already available" check and before counting, the route applies the aliases the
   packs Worker applies (`es` → `es-419` in `serving.md`; for the parts build, `pt` → `pt-br`, `zh` → `zh-hans`,
   `ar` → `ar-x-strong`, `VARIANTS` in `packViews.ts`), so counts do not split between two spellings of one language.
4. **`GET /api/requests`**: every requested language with its count, last state and last time, for the page's counter.
5. **The page `public/catalog/`**: static HTML, CSS and JS in the site's existing style, using the same
   `language-pack-client.js` bundle as `format-3/try/`.
   - Lists languages from `/api/languages`, with a search box. On opening a language it fetches and verifies its
     catalog (and the common catalog) and shows resources, books with sizes, revision and the signature result.
   - The visitor picks books or "whole language"; the page downloads the segments into IndexedDB with the client
     library (with progress), then calls `exportTransfer` in `full` mode and offers the result as a file download.
     Installing the chosen books plus the common catalog is enough: `full` export carries the common catalog and the
     pieces the books `need` (map, topics); without the common catalog it fails with `E_NOT_INSTALLED`.
   - **Size:** `exportTransfer` builds the whole file in memory, on top of what is in IndexedDB. Books are the default
     choice; "whole language" stays available, with its size shown and a warning before it starts when it is large
     (the threshold, for example 200 MB, is measured on a phone in the plan).
   - The bundled `language-pack-client.js` is rebuilt from tc-study master before the page uses `exportTransfer`, as
     the README asks whenever the library changes.
   - A "request a language" form (tag, optional reason, Turnstile widget) posts to `/api/requests` and shows the
     answer in plain words. Below it, the counter list from `GET /api/requests`.
   - States and failures are shown in words a non-developer understands; nothing claims "coming" unless the state is
     `preparing`.

### Abuse limits

- Turnstile on every request post.
- Per-address limit (for example 5 requests an hour), kept in KV or with Workers rate limiting.
- One count per address per language per day, so one person cannot inflate a counter.
- The real build budget stays the staging Worker's guard (daily cap, cool-downs); tc-catalog adds none of its own.

### Data kept

KV, per language: `count`, `lastState`, `lastReason` (the staging reason, not the visitor's text), `lastAt`. The
visitor's free-text reason is kept only as the last few entries per language, trimmed, never shown publicly unless
Abel decides so later. No IP addresses are stored beyond the rate-limit keys, which expire.

## Constraints

- Nothing pushed, deployed or published without Abel's yes. Production is not touched.
- No secrets in the repository: the Turnstile secret is a Worker secret Abel sets; the site key is public.
- Code is written by Cursor and reviewed by Claude (uW rule); the plan's tasks are briefs for Cursor.
- Commits in English with a why.

- Deploy stays by hand (`wrangler deploy` from the repository, with Abel's yes); the repository has no deploy workflow.
  Adding `main`, an R2 binding, a KV namespace, a service binding and a secret means the first deploy needs those
  created first (KV namespace, Turnstile site and secret), each with Abel's yes.

## Calls made in writing this (for Abel to check)

- The "preparing" state comes from the bucket's build status, not from staging's `202` alone.
- A language with format 2.0 parts but no format 3 catalog is `waiting-format-3`; a request does not force a build.
- Language aliases are applied before counting.
- Books are the default download; whole language is allowed with a size warning.
- Deploy is by hand; the Worker reaches staging through a service binding.

## Left to the builder

- File layout of the Worker script and of `public/catalog/`, and whether it is plain JS or a small TS file bundled with
  wrangler (the site has no build step today; wrangler bundles the Worker script itself).
- Exact cache headers of the API routes, exact rate-limit numbers within the limits above.
- How the page names resources and books (reuse what `format-3/try/` does).

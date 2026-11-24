# tC Language Packs

A static site for developers about language packs: one file that carries a Bible translation language, already
prepared, and opens offline. The landing page explains them at a high level; `inside/` describes the format and
`build/` the code and the server routes.

- `public/` is the whole site: plain HTML, CSS and a little JavaScript, with no build step.
- `public/data/titus-1-1.json` holds the real rows of one note of Titus 1:1, taken from the English parts of
  29 October 2026; the landing page embeds the same data for the layer switch.
- `public/assets/` holds the photographs, each with its source and licence in `credits.json`. Their credits are in
  the footer of the page that shows them.
- `.taste-skill/direction.json` records the design direction the site was built from.

## The agent skills

`plugins/tc-language-packs/` is a Claude Code plugin with two skills that share one reader (`src/langpack.py`, Python
standard library only, copied into each skill):

- `tc-language-packs-translator` helps a Bible translator with a passage: `context` gives a verse in every text, the
  original word by word with its lexicon and renderings, the notes with their gateway words, the questions, the key
  terms, and where each word appears in other books.
- `tc-language-packs-dev` helps a code agent build with packs: the format, keys, versions, parts, the v3 word index, the
  TypeScript packages, the server routes and the MCP views.

```
/plugin install tc-language-packs --marketplace unfoldingWord/tc-language-packs
```

Other harnesses (Codex, Cursor, Gemini CLI) read the same folders: unzip
https://tc-language-packs.unfoldingword.workers.dev/skills/tc-language-packs-translator.zip or `…/language-packs-dev.zip` into
`.agents/skills/`.

After changing the reader or a skill, run `python tools/publish_skills.py`: it copies the reader into both skills and
publishes them in `public/skills/` with their zips. Check with `claude plugin validate .` and
`claude plugin validate ./plugins/tc-language-packs --strict`.

## The page that tries a pack

`public/format-3/try/` downloads a language in format 3 from the staging Worker
(`translation-helps-mcp-v2-preview.unfoldingword.workers.dev`, routes `/v3/packs/…`) into the browser's IndexedDB and
asks it the client library's queries. `language-pack-client.js` next to it is `@bt-synergy/language-pack-client`
packed into one file. It was built from `unfoldingWord/tc-study` at `3cb4fc75` (master, after unfoldingWord/tc-study#109: the client downloads and exports complements, the map background; before that #98, the Five Movements
sessions, the family of a person and the story pictures), with:

```bash
bun build packages/language-pack-client/src/index.ts --target=browser --format=esm --minify --outfile language-pack-client.js
```

Rebuild it when the library changes.

`tc-packs-mcp.mjs` and `tc-packs-translator.zip` in the same folder are the local MCP server and its skill, from
`packages/language-pack-mcp` of tC Study: `bun run bundle` there writes `dist/tc-packs-mcp.mjs`, and the zip holds
`skill/tc-packs-translator/`. Copy both again when the package changes. The page trusts the staging publisher key (`78d2e6299a2de4d0`, from
`packages/language-pack-v3/keys/`); a page that reads production needs the production key.

## tc-catalog

`public/catalog/` is a page that lists format 3 languages from the staging bucket, lets a visitor download chosen books
and other units (OBS, Academy manuals, lexicon, phrase index) as one `.tcpack` transfer file built in the browser, and
lets them ask for a language that is missing (with a per-language request counter). The Worker script in `src/worker/`
answers `/api/*`; every other path falls through to the static assets in `public/`.

### Worker routes

| Route | Method | What it does |
| --- | --- | --- |
| `/api/languages` | GET | Lists format 3 catalogs in the staging R2 bucket (`v3/catalog/`, excluding `common.seg`). |
| `/api/requests` | GET | Lists every requested language with count, last state and time (from KV). |
| `/api/requests` | POST | Body `{ lang, reason?, token }`: checks Turnstile, rate limits, normalizes the tag, asks staging when needed, counts the request in KV, returns `{ lang, state, count }`. |

### Bindings and vars (`wrangler.jsonc`)

| Binding / var | Kind | Staging value |
| --- | --- | --- |
| `ASSETS` | assets | `public/` with `run_worker_first: ["/api/*"]` |
| `PACKS` | R2 | `language-packs-staging` (read) |
| `REQUESTS` | KV | placeholder id `<set by Abel>` until the namespace exists |
| `STAGING` | service | `translation-helps-mcp-v2-preview` |
| `PARTS_COMPAT` | var | `f2.0-u2.3.0-p6000230-q9-a12-t1` |
| `TURNSTILE_SITE_KEY` | var | public test key `1x00000000000000000000AA` until the real widget key replaces it |
| `TURNSTILE_SECRET` | secret | not in the repo; set with `wrangler secret put` |

The page reads the site key from `<meta name="turnstile-site-key">` (same test key today). Staging only: the trusted
publisher key on the page is `78d2e6299a2de4d0`. Production is not touched.

### Before the first deploy (Abel)

1. Create a KV namespace and put its id in `wrangler.jsonc` under `REQUESTS` (replace `<set by Abel>`).
2. Create a Turnstile widget for the site, put the site key in `vars.TURNSTILE_SITE_KEY` and in the catalog page meta
   tag, and set the secret with `npx wrangler secret put TURNSTILE_SECRET`.
3. Confirm the R2 bucket `language-packs-staging` and the service binding to `translation-helps-mcp-v2-preview` are
   usable from this Worker in the unfoldingWord Cloudflare account.
4. Only then: `npx wrangler deploy` (with Abel's yes). Do not commit real secrets or the real KV id until that is ready.

Local preview of the API: `npx wrangler dev` with a gitignored `.dev.vars` that sets `TURNSTILE_SECRET` (Cloudflare's
always-pass test secret is fine for local checks). KV and R2 stay local unless Abel allows `--remote`.

## Preview

```bash
npx serve public
```

## Publish

The site runs on Cloudflare's account of unfoldingWord as `tc-language-packs`: a Worker that serves `public/` as static
assets and answers `/api/*` (`wrangler.jsonc`). It is live at https://tc-language-packs.unfoldingword.workers.dev.

```bash
npx wrangler deploy
```

The facts on the pages come from `unfoldingWord/tc-study` (`packages/language-pack`, `packages/resource-pipeline`),
`unfoldingWord/translation-helps-mcp` (`docs/LANGUAGE_PACKS_INFRA.md`, `src/api/routes/packViews.ts`) and the design
documents of Servos (`docs/PAQUETES_DE_IDIOMA.md`). Check them against those sources when they change.

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
packed into one file. It was built from `unfoldingWord/tc-study` at `063b69a9` with:

```bash
bun build packages/language-pack-client/src/index.ts --target=browser --format=esm --minify --outfile language-pack-client.js
```

Rebuild it when the library changes. The page trusts the staging publisher key (`78d2e6299a2de4d0`, from
`packages/language-pack-v3/keys/`); a page that reads production needs the production key.

## Preview

```bash
npx serve public
```

## Publish

The site runs on Cloudflare's account of unfoldingWord as `tc-language-packs`: Pages in its current form, a Worker that
serves `public/` as static assets (`wrangler.jsonc`). It is live at https://tc-language-packs.unfoldingword.workers.dev.

```bash
npx wrangler deploy
```

The facts on the pages come from `unfoldingWord/tc-study` (`packages/language-pack`, `packages/resource-pipeline`),
`unfoldingWord/translation-helps-mcp` (`docs/LANGUAGE_PACKS_INFRA.md`, `src/api/routes/packViews.ts`) and the design
documents of Servos (`docs/PAQUETES_DE_IDIOMA.md`). Check them against those sources when they change.

# Contributing to tC Language Packs

tC Language Packs are open, and programmers and their agents are welcome to improve them. The work lives in three
places; open issues and pull requests where the code is.

| What | Where |
|---|---|
| The format, and the code that makes, opens and downloads packs | [unfoldingWord/tc-study](https://github.com/unfoldingWord/tc-study): `packages/language-pack`, `packages/resource-pipeline` |
| The server that serves packs and parts, and answers from views | [unfoldingWord/translation-helps-mcp](https://github.com/unfoldingWord/translation-helps-mcp): `src/api/routes/packs.ts`, `packViews.ts` |
| This site, the agent skills and their reader | this repository: `public/`, `plugins/tc-language-packs/`, `src/langpack.py` |

## Start

```bash
git clone https://github.com/unfoldingWord/tc-study
cd tc-study && bun install
cd packages/language-pack && bun test
```

Real packs to test with: the English parts list at
`https://tc-helps.mcp.servant.bible/v2/packs/f2.0-u2.3.0-p6000230-q9-a12-t1/en` names every part; fetch them at
`…/v2/packs/parts/{sha256}` and check each sha256. To make packs of a small language yourself:
`bun packages/resource-pipeline/cli/prepare-language.ts --lang <code> --out ./packs --books all`.

## With a coding agent

Give your agent the developer skill before anything else (`/plugin install tc-language-packs --marketplace
unfoldingWord/tc-language-packs` in Claude Code, or `plugins/tc-language-packs/skills/tc-language-packs-dev` in
`.agents/skills/` elsewhere). It knows the files, the cache keys and their book stamps, the versions that decide
whether rows can be used, the parts and the word index, and its reader inspects real packs with Python alone.

## Open work

- **The word index (language packs v3).** Every verse where a Greek or Hebrew word appears, in every book, even books
  not on the device; then the gateway renderings, notes and word links of each book, and a summary per language.
- **Packs that outlive the code.** A change in the code that prepares a layer makes older packs unreadable for that
  layer. A stable level of source and views would let teams keep sharing packs across app versions.
- **A public schema.** JSON Schema for the manifest, the parts list and each row.
- **Signed packs.** A signature that checks with no internet, for packs passed hand to hand.
- **tC Study opens packs.** Its reading page still needs the network to open a language.
- **Answers with no internet.** translation-helps-mcp reading packs or views from a folder.
- **More languages.** Any language with an aligned literal text marked `tc-ready` on Door43 can be packed; try yours
  and report what breaks.

## This repository

- The site is plain HTML in `public/`, with no build step. Every number and row on it comes from real packs: when
  you change one, measure it again and say where it came from.
- The reader has one source, `src/langpack.py`. After changing it or a skill, run `python tools/publish_skills.py`,
  which copies it into both skills and publishes them in `public/skills/` with their zips, then
  `claude plugin validate .` and `claude plugin validate ./plugins/tc-language-packs --strict`.
- Preview with `npx serve public`. Publishing (`npx wrangler deploy`) is done by the maintainers.

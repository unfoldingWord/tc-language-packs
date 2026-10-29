# Language Packs site

A static site for developers about language packs: one file that carries a Bible translation language, already
prepared, and opens offline. The landing page explains them at a high level; `inside/` describes the format and
`build/` the code and the server routes.

- `public/` is the whole site: plain HTML, CSS and a little JavaScript, with no build step.
- `public/data/titus-1-1.json` holds the real rows of one note of Titus 1:1, taken from the es-419 pack of
  29 October 2026; the landing page embeds the same data for the layer switch.
- `public/assets/` holds the photographs, each with its source and licence in `credits.json`. Their credits are in
  the footer of the page that shows them.
- `.taste-skill/direction.json` records the design direction the site was built from.

## Preview

```bash
npx serve public
```

## Publish

The site runs on Cloudflare's account of unfoldingWord as `language-packs`: Pages in its current form, a Worker that
serves `public/` as static assets (`wrangler.jsonc`). It is live at https://language-packs.unfoldingword.workers.dev.

```bash
npx wrangler deploy
```

The facts on the pages come from `unfoldingWord/tc-study` (`packages/language-pack`, `packages/resource-pipeline`),
`unfoldingWord/translation-helps-mcp` (`docs/LANGUAGE_PACKS_INFRA.md`, `src/api/routes/packViews.ts`) and the design
documents of Servos (`docs/PAQUETES_DE_IDIOMA.md`). Check them against those sources when they change.

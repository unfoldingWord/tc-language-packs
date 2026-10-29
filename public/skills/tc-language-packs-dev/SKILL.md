---
name: tc-language-packs-dev
description: Build software that makes, opens, downloads, serves or reads tC Language Packs (Bible translation language packs of the translationCore family) — the offline .langpack.zip files and format 2.0 .part.gz parts that unfoldingWord's tC Study pipeline (bt-synergy) writes and Servos, tC Study and translation-helps-mcp read. Covers the file layout, manifest, layers and cache keys, kinds of pack, version and compatibility rules, parts lists and the parts server routes, the v3 word index (index layer, Strong's codes, word lists), the TypeScript packages (@bt-synergy/language-pack, importLanguagePack, buildLanguagePack, planParts, applyParts), MCP views, and a dependency-free Python reader for inspecting packs. Use this skill whenever code touches language packs or Door43 translation resources offline — an app, a CLI, a server, an MCP tool, tests, a pack inspector — or someone asks how packs work inside, even if they only say "langpack", "parts", "pack format" or name tC Study's cache.
license: CC BY-SA 4.0
compatibility: The TypeScript packages live in github.com/unfoldingWord/tc-study (Bun or Node). scripts/langpack.py needs Python 3.8+ only.
metadata:
  author: unfoldingWord
  site: https://tc-language-packs.unfoldingword.workers.dev
  version: "1.0"
---

# Building with tC Language Packs

A language pack carries a Bible translation language already prepared, as the rows tC Study keeps in its cache:
gateway texts with their alignment to the Greek and Hebrew, notes, questions, words, word links, articles and
lexicons, each note's quote already found in the original and in each gateway text, and article titles. Opening a
pack is writing those rows into the same stores the reading code uses, so the app reads offline as if it had
downloaded and prepared everything itself. With internet, the same rows come as small content-addressed parts.

## Look before you code

Inspect real packs with the bundled reader; it needs only Python and reads zips, parts and parts lists in place:

```bash
python scripts/langpack.py info PACKS                       # kinds, resources, stamps, books, versions, compat key
python scripts/langpack.py keys PACKS --layer prepared --prefix prepared:notes: --limit 10
python scripts/langpack.py row  PACKS --key "prepared:notes:unfoldingWord/en/tn:tit:2:light"
python scripts/langpack.py context PACKS --ref "TIT 2:11"   # what an app shows for one verse, as data with --json
```

`PACKS` is files or a folder: `originals.langpack.zip en.langpack.zip`, or a folder of `*.part.gz` with its parts lists
(`*.json`, schema 2). The reader's functions are short and commented; port them when you need the same logic in
another language. `--json --out FILE` writes UTF-8 (safer than a pipe on Windows, whose console may be cp1252; in your
own Python scripts write files in UTF-8 or run `python -X utf8`).

Get real English parts from the production server: the list at
`https://tc-helps.mcp.servant.bible/v2/packs/f2.0-u2.3.0-p6000230-q9-a12-t1/en`, the originals list it names, and each
part at `…/v2/packs/parts/{sha256}` (check the sha256). Titus with its original is 403 KB; the shared unit (TW, TA,
lexicons, titles) 3.7 MB; all of English 165 MB in 595 parts.

## The rules that matter most

- **Keys are the contract.** Rows are `{key, entry}` exactly as the cache keeps them; file names inside a zip are only
  for people. Read [references/format.md](references/format.md) before writing code that reads or writes rows.
- **Versions decide what can be used.** The manifest's `versions` say which code made each layer. A different `sot` or
  `receipt` version means the pack cannot be used (the import throws); a different derived version means that layer
  is skipped and must be rebuilt from the source rows. State every layer your app reads, so nothing slips in
  unchecked. The compatibility key (`f2.0-u2.3.0-p6000230-q9-a12-t1`) summarizes them; servers keep packs under it.
  It does not cover every preparer: check each prepared row's own `version` too (notes are `5`), and remember that a
  reader without the rebuild code cannot skip a `prepared` mismatch.
- **Derived keys carry book stamps.** `helps-quote`, `helps-align` and `helps-text` keys embed content stamps
  (`g` + 10 hex of the book's blob, else the release stamp). Build them from the catalog row, as format.md shows; a
  key built from the release stamp alone finds nothing.
- **Stamps decide what is newer.** Each resource carries its Door43 release stamp (`v91#2026-09-26T15_47_18Z`). Never
  replace a newer copy with an older one; show the person what changes before replacing.
- **Originals first.** Notes' quotes point into the original release the pack `requires`; open the originals before
  a language, or the quotes wait.
- **Receipts last.** A resource is complete only when its receipt is written, after all its rows; a cut import
  leaves no false receipt, and opening again fills the gaps. Book packs and parts carry no receipts: the app writes
  them when every part of a resource is in.
- **Unknown is skipped, not fatal.** Readers skip parts of a kind, layer or index version they do not know, so new
  optional layers (like `index`) can ship without breaking older apps.
- **Modular means partial.** An app holds some books. Every cross-book answer must say which books were not searched.

## The v3 word index

Language packs v3 add an optional `index` layer so an app can find every verse where an original word occurs, across
books that may not be on the device:

```
index:verses:{original}:{book}          { v, stamp, words, verses: "1:1 1:2 …", starts: <word list> }
index:strong:{original}:{code}:{book}   { v, stamp, lemma, words: <word list> }
```

Words of a book are numbered from 0; a word list is sorted numbers as LEB128 gaps in base64; `starts` maps word
numbers to verses. Codes follow the lexicon (`G5485`, `H0776`). An app reads it only when it states
`versions.index.helpsIndex` (1). Details, and how gateway renderings, Translation Academy citations and Translation
Words links join it, are in [references/format.md](references/format.md). `scripts/langpack.py occurrences` reads it,
and finds the same places in the original's words when a pack has no index.

## Where to go next

- [references/format.md](references/format.md): files, manifest, layers and keys with their value shapes, kinds,
  versions, parts lists, the word index.
- [references/code.md](references/code.md): the TypeScript packages (read a manifest, import, build, plan and apply
  parts), the command that makes packs, the parts server routes and answers, and the views translation-helps-mcp
  serves.
- A complete app: Servos, `src/resources/` in github.com/idiomaspuentes/servos (opening packs, comparing stamps,
  downloading parts, reading verses and notes).

---
name: language-packs
description: Read and use Bible translation language packs (.langpack.zip files and .part.gz parts made by unfoldingWord's tC Study pipeline) offline. Use this skill whenever someone has a language pack, asks about one, or wants Bible texts and translation helps without internet — gateway texts (ULT, UST, GLT, GST), the Greek and Hebrew originals (UGNT, UHB), translation notes, questions, words, word links, Translation Academy, lexicons and MACULA — including questions like "what does the note on Titus 1:1 say", "how was χάρις translated", "every verse with this Strong's number", "every note that cites figs-metaphor", or when building an app, server or MCP tool that opens, makes or downloads packs (Servos, tC Study, translation-helps-mcp). Use it even if the user only says "pack", "langpack", "translation helps offline" or names Door43 resources.
license: CC BY-SA 4.0
compatibility: Needs Python 3.8+ (standard library only) to run scripts/langpack.py. No network needed to read packs.
metadata:
  author: unfoldingWord
  site: https://language-packs.unfoldingword.workers.dev
  version: "1.0"
---

# Language packs

A language pack is one file that carries a Bible translation language already prepared: its gateway texts aligned
to the Greek and Hebrew, its translation notes, questions, words and word links, Translation Academy articles and
lexicons, with every note's quote already found in the original and in each gateway text. It is a zip of the rows
tC Study keeps in its cache, so it opens with no internet and needs no parsing. Packs travel by SD card, USB,
Bluetooth or a chat message to translation teams who work offline; with internet the same rows come as small parts.

Use the bundled reader for anything about a pack's content. It needs only Python, reads zips and parts in place, and
answers in plain text or `--json`. Read the references only when you build software around packs.

## Which files to give the reader

A language is often split. Pass every file that belongs together, or a folder holding them:

| File | Holds |
|---|---|
| `originals.langpack.zip` | The Greek New Testament, the Hebrew Bible and MACULA. The same for every language. |
| `{lang}.langpack.zip` | Every resource of one language (texts, notes, questions, words, links, academy, lexicons). |
| `{lang}-base.langpack.zip` | Translation Words, Translation Academy and lexicons, and the catalog of the book resources. |
| `{lang}-{book}.langpack.zip` | One book's texts, notes, questions and word links. Pair it with the base pack. |
| `*.part.gz` | The same rows in format 2.0 parts (gzip JSONL). A folder of parts works like a pack. |

Start with `info`: it says what each file brings, which releases (`stamp`, like `v42#2026-08-11T12_22_03Z`), which
books, which original release the notes were matched against (`requires`), and the pack's compatibility key
(`f1.1-u2.3.0-p6000230-q9-a12-t1`). Software reads a pack's prepared rows as they are only when its own key is the same.

## The reader

`scripts/langpack.py` (in this skill's folder). Every command takes the pack files first; add `--json` to any.

```bash
python scripts/langpack.py info      PACKS...
python scripts/langpack.py verse     PACKS... --text glt --ref "TIT 1:1"
python scripts/langpack.py align     PACKS... --text glt --ref "TIT 1:1"
python scripts/langpack.py notes     PACKS... --ref "TIT 1:1" --text glt
python scripts/langpack.py questions PACKS... --ref "TIT 1:1"
python scripts/langpack.py links     PACKS... --ref "TIT 1:1"
python scripts/langpack.py article   PACKS... --path translate/figs-metaphor
python scripts/langpack.py lexicon   PACKS... --strong G5485
python scripts/langpack.py occurrences PACKS... --strong G5485 --text glt
python scripts/langpack.py occurrences PACKS... --academy figs-metaphor --text glt
python scripts/langpack.py occurrences PACKS... --word bible/kt/grace --text glt
python scripts/langpack.py keys      PACKS... --layer prepared --prefix prepared:notes: --limit 20
python scripts/langpack.py row       PACKS... --key resource:es-419_gl/es-419/glt
```

- A reference is a book code, chapter and verse: `"TIT 1:1"`, `"3JN 1:4"`, `"JON 2:3"`.
- A resource is its full key (`es-419_gl/es-419/glt`) or its last part (`glt`, `gst`, `tn`, `ugnt`, `uhb`). Without
  one, the reader takes the first resource of the right kind and says so when the short name is ambiguous.
- `notes --text glt` adds the words of that gateway text the note is about (`κατὰ πίστιν → conforme a la fe`). Book
  and chapter introductions are left out unless you add `--intro`.
- `article --path` takes `translate/figs-metaphor`, `bible/kt/grace`, or the `rc://*/ta/man/…` link a note gives.
- `lexicon --strong` takes `G5485` or `H2580`; senses list the verses they apply to when the lexicon has them.
- `--json` gives everything, uncut; `--out FILE` writes the result to a UTF-8 file. Prefer `--out` to a pipe on
  Windows, whose console may not be UTF-8 (with `python -I`, `PYTHONIOENCODING` is ignored; use `-X utf8`).
- A note's `occurrence` says which occurrence of its quote in the verse it is about: `1`, `2`…; `-1` means every
  occurrence; `0` means the note has no quote in the text (a connecting statement or a general note).

## Across books: every place a word, article or link occurs

`occurrences` answers "where else in the Bible?" in one call:

- `--strong G5485` lists every verse of the original where a word carries that Strong's code (χάρις: 148 verses in
  23 books), and with `--text glt` how that gateway text rendered it in each verse it has. Codes follow the lexicon:
  Greek without the UGNT's extra digit (`G5485`), Hebrew padded to four digits (`H0776`, `H1121a`).
- `--academy figs-metaphor` lists every note that cites a Translation Academy article, by book.
- `--word bible/kt/grace` lists every Translation Words link to an article, by book.
- With `--text glt`, notes and links come with the words of that gateway text they are about. `--books tit,rut`
  limits the search; text output shows 12 places per book (`--limit 0` shows all), `--json` always has all.
- Notes come in the same shape from `notes` and from `occurrences` (`id`, `reference`, `quote`, `occurrence`,
  `supportReference`, `note`, and `textQuote` with `--text`), so results join by `id`.

Packs are modular, so the answer says what is not on the device. The originals always come whole, so a Strong's
search covers all 66 books. Notes, links and gateway texts come per book: the reader names the books a release has
but the device lacks ("in the release, not on this device"), and the books the release does not have yet. Tell the
person which pack would complete the answer instead of implying the word is absent there.

Packs of language packs v3 carry the word index as an optional `index` layer, and the reader uses it when present:

```
index:verses:{original}:{book}          { v, stamp, words, verses: "1:1 1:2 …", starts: <word list> }
index:strong:{original}:{code}:{book}   { v, stamp, lemma, words: <word list> }
```

Every word of a book of the original has a number from 0, in order, chapter 1 on. A word list is the sorted numbers,
each written as its gap from the previous one minus one, in unsigned LEB128, then base64. `starts` gives the first
word of each verse in `verses`, so a word number maps to its verse by binary search. `v` is the index version
(`HELPS_INDEX_VERSION`, 1); skip rows of another version. Without the layer the reader walks the original's words
and gives the same answer, a few seconds slower.

## Answering people well

- Quote texts and notes exactly as the pack has them, in their language, and name the resource and its release when
  it matters (`Texto Puente Literal v42`). The person may compare it with a printed copy.
- A note's `quote` is in Greek or Hebrew. Show the gateway words beside it (`notes --text …`), because translators
  read the gateway text.
- Notes link articles with `rc://*/ta/man/translate/…` and word links with `rc://*/tw/dict/bible/…`; open them with
  `article` rather than describing them from memory.
- The resources are openly licensed, mostly CC BY-SA 4.0. Their catalog rows in the pack (`catalog.json`) carry the
  license and the publisher; keep the attribution when you copy text into anything that will be shared.
- If a command says a chapter is missing, the book's pack was not given. Say which file would bring it.

## Building with packs

Read [references/format.md](references/format.md) for the files, manifest, layers, keys, kinds, versions, parts and
index, and [references/code.md](references/code.md) for the TypeScript packages (`@bt-synergy/language-pack`), the
command that makes packs, the server routes that serve parts, and the views translation-helps-mcp reads. The short
version:

- Open packs into the same stores the reading code uses, passing your processing `versions`: a pack made with another
  source version is refused; a derived layer of another version is skipped and can be rebuilt.
- Open the originals pack first; the notes' quotes point into it.
- Book packs have no receipts: a receipt claims a whole release. Track the books you hold from the manifest.
- With internet, download only the parts you lack and check each part's sha256 against its name before applying it.

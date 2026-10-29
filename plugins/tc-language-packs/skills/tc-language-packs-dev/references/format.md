# The language pack format

Contents: the file · the manifest · layers and keys · kinds of pack · versions · parts (format 2.0) · the word index

Source of truth: `packages/language-pack` in github.com/unfoldingWord/tc-study (`src/types.ts`, `src/pack.ts`,
`src/keys.ts`, `src/parts/`), and `apps/tc-study/docs/cache-data-structure.md` for every key and envelope.

## The file

A zip (DEFLATE level 9) named `*.langpack.zip`:

```
manifest.json                         what it is, what it brings
catalog.json                          [{ key, metadata }]: each resource's Door43 catalog row (license, publisher…)
rows/{layer}/{resource}.jsonl         one {"key", "entry"} per line, raw as the cache store keeps it
```

`{resource}` is `encodeURIComponent(key)` with `%` written `~` (`unfoldingWord~2Fen~2Fult`). File names are for people;
the real key is inside each row. Large layers are big unzipped (the Hebrew source is 82 MB): read lines as a stream.

## The manifest

The shape of an English book pack's manifest, with the versions and stamps of the English release of October 2026
(English travels as parts today; a book pack is what `prepare-language --books tit` writes):

```json
{
  "format": "bt-synergy-language-pack",
  "formatVersion": "1.1.0",
  "language": "en",
  "kind": "book",
  "books": ["tit"],
  "requires": [{ "key": "unfoldingWord/el-x-koine/ugnt", "stamp": "v0.34#2023-09-27T02_19_31Z" }],
  "createdAt": "2026-10-29T02:01:28.497Z",
  "layers": ["receipt", "sot", "prepared", "quote", "align", "text"],
  "versions": { "sot": { "usjProcessing": "2.3.0-usj" }, "prepared": { "scripturePrepare": 6000230 },
                "quote": { "helpsQuote": 9 }, "align": { "helpsAlign": 12 }, "text": { "helpsText": 1 } },
  "resources": [{ "key": "unfoldingWord/en/ult", "role": "language", "stamp": "v91#2026-09-26T15_45_57Z",
                  "subject": "Aligned Bible", "title": "unfoldingWord® Literal Text", "rows": { "sot": 5, "prepared": 7 },
                  "books": ["gen", "exo", "…", "tit", "…"] }]
}
```

- `format`, `formatVersion`: a reader refuses a pack whose major version is newer than its own.
- `kind`: `language`, `originals`, `base` or `book`. A 1.0 pack has none and is a `language` pack.
- `requires`: the original releases the notes' quotes were found in.
- `resources[].key` is `{owner}/{language}/{id}`; `stamp` is the Door43 release `{tag}#{published_at}` with `:` written
  `_`; `books` are the books the release has, whether or not this pack carries them.

## Layers and keys

| Layer | Holds | Keys |
|---|---|---|
| `receipt` | A resource arrived whole, its release and schema. Written last. | `resource:{key}` |
| `sot` | Chapters as USJ with `alignmentMap`; notes, questions, word links by book; TW and TA articles (markdown); lexicons; MACULA | `scripture-usj:{key}:{book}` (chapter list), `scripture-usj:{key}:{book}:{ch}`, `tn:{key}:{book}`, `tq:…`, `twl:…`, `{key}/{article path}`, `{key}/content/{n}.json`, `{key}/trees/{BOOK}` |
| `prepared` | Chapters ready to draw: `light` (blocks of text) and `full` (each word with its occurrence and the original words it translates); notes, questions and links by chapter; articles | `prepared:{type}:{key}:{book}:{chapter}:{light\|full}` with type `scripture`, `notes`, `questions`, `words-links`, `words`, `academy` |
| `quote` | Each note's and link's quote found among the original's words | `helps-quote:{helps}@{stamp}:{original}@{stamp}+{usj}:{book}:{ch}` → `{ noteId: [tokens] }` |
| `align` | The same quote found in a gateway text | `helps-align:…:{text}@{stamp}:{book}:{ch}` → `{ noteId: { p: [positions], m, t: [words] } }` |
| `text` | Titles of TA and TW articles | `helps-text:ta-title:{key}@{stamp}:{article}` |
| `index` | The word index, optional (see below) | `index:verses:…`, `index:strong:…` |

### Stamps inside derived keys

The `@{stamp}` parts of `helps-quote`, `helps-align` and `helps-text` keys are not always the release stamp. For a
book-scoped resource they are the book's content stamp (`bookContentStamp`, `packages/resource-catalog/src/ingestReceipt.ts`):
`g` + the first 10 hex characters of `metadata.contentMetadata.bookBlobs[book]` from the resource's catalog row, when
`contentMetadata.bookBlobsRef` equals the release tag; otherwise the release stamp. So a book that did not change
keeps its rows across releases. Build keys from the catalog row this way rather than matching any key by pattern:
it also proves the quotes were found in this exact original book. The gateway text in an align key carries its
prepare version too: `{text}@{stamp}+{scripturePrepare}`. Real keys of Titus 1 in English:

```
helps-quote:unfoldingWord/en/tn@g9e6a394c0e:unfoldingWord/el-x-koine/ugnt@g987ab2025a+2.3.0-usj:tit:1
helps-align:unfoldingWord/en/tn@g9e6a394c0e:unfoldingWord/el-x-koine/ugnt@g987ab2025a+2.3.0-usj:unfoldingWord/en/ult@g252ea4a894+6000230:tit:1
helps-text:ta-title:unfoldingWord/en/ta@v91#2026-09-26T15_47_36Z:translate/figs-abstractnouns
```

### Row values

Rows are stored with an envelope; read `content` and check `version` (see Versions):

- `prepared:*` → an envelope `{ content, version, … }` (in a pack the row's `entry`, in a part its `value`), whose
  `content` repeats the preparer's `version` and the `unit` (chapter, or article path).
- `scripture-usj:{key}:{book}:{ch}` → `{ bookId, chapter, resourceKey, content: { usj, alignmentMap, … } }`; the book
  row `scripture-usj:{key}:{book}` holds `content.chapterNumbers`.
- `tn:{key}:{book}` is a stub (`_chunkedBook: true`); the notes are in `tn:{key}:{book}:{ch}`. The same for `tq:`.
- Articles and lexicon entries are the plain value (markdown text, or the JSON entry).

Shapes, inside `content`:

- Prepared scripture, light: `{ version, unit, blocks: [{ marker, role, indentLevel, chapterNumber, verseNumbers,
  inline: [{ kind: "verse", chapterNumber, verseNumber } | { kind: "text", text } | { kind: "heading", text } |
  { kind: "note", caller, text }] }] }`. A verse's text is the `text` items after its `verse` item, up to the next one.
- Prepared scripture, full: the same blocks with `{ kind: "token", token: { c, o, k, a } }` items (surface, occurrence,
  index of its match key in `matchKeys`, indices of the original words it is aligned to) and `matchKeys`.
- `alignmentMap["TIT 1:1"]`: `[{ sources: [{ strong, lemma, morph, content, occurrence, occurrences }], targets: [{ word,
  occurrence, occurrences }] }]`: which gateway words translate which original words.
- An original's USJ word: `{ "marker": "w", "content": ["Παῦλος"], "lemma": "Παῦλος", "strong": "G39720", "x-morph": … }`.
- Prepared notes, light: `notes: [{ id, reference, quote, occurrence, note, body, supportReference, tags, isIntro? }]`.
  `note` is markdown with line breaks written as backslash-n (TSV); `body` is the same as plain text; `occurrence` is a
  string: `"1"`, `"2"`… for one occurrence of the quote in the verse, `"-1"` for every occurrence, `"0"` for a note with
  no quote; `isIntro` marks book and chapter introductions; `&` in a quote marks a gap. The full tier adds `bodyHast`
  and `quoteFolded`.
- Prepared links: `links: [{ id, reference, origWords, occurrence, twLink, articlePath, tags }]`; questions:
  `questions: [{ id, reference, question, response }]`.
- Quote rows: `{ noteId: [{ id, text, content, occurrence, chapter, verse, type }] }`, where `id` is the word's position
  in the verse (positions that are not next to each other mark a gap).
- Align rows: `{ noteId: { p: [positions in the prepared full chapter], m, t: [words] } }`; `m: 0` is a settled miss.
- A lexicon entry: `{ brief, long, entries: [{ strong, lemma, pos, senses: [{ glosses, definition, domain, refs }] }] }`,
  where `refs` maps a book code to `"1:7,9;2:3"`. Some lexicons (the English one of 2021) have only `brief`.

## Kinds of pack

| Kind | Holds | English as parts, Oct 2026 |
|---|---|---|
| `originals` | UGNT, UHB, MACULA. The same for every language. | 22.9 MB in 132 parts |
| `language` | Every resource of the language, whole, with receipts. No originals. | 165 MB in 595 parts (ULT, UST, BSB, T4T, TN, TQ, TW, TWL, TA, lexicons) |
| `base` | TW, TA, lexicons, OBS whole; catalog rows and book lists of the book-scoped resources. | 3.7 MB, the shared unit |
| `book` | The texts, notes, questions and links of the named books. No receipts. | 126 KB (3 John) to 12.7 MB (Psalms), with the book's original; Titus 403 KB |

## Versions

Three, answering three questions:

1. Can I read this file? `formatVersion`.
2. Is this copy newer than mine? Each resource's `stamp`. Never replace a newer copy with an older one.
3. Can I use its rows? `versions`: the code version that made each layer. A different `sot` or `receipt` version means
   the reader cannot use the pack; a different derived version means that layer is skipped and rebuilt.

`compatKeyOf(formatVersion, versions)` makes a key such as `f1.1-u2.3.0-p6000230-q9-a12-t1`; servers keep packs under
it and an app asks only for its own. Parts use format 2.0, so their key starts with `f2.0`. These versions move with
the code: packs made on 20 October 2026 are `p5000230-q7-a10`, those of 29 October `p6000230-q9-a12`. To know
whether a pack fits an app, compare the pack's key with the one the app's own constants make; `langpack.py info`
prints the pack's.

The compat key does not cover everything. Each prepared row also carries its preparer's `version`: scripture
`6000230` (the `p` of the key), notes `5`, questions, links, words and academy `1` (`*_PREPARE_VERSION` in
`packages/resource-pipeline/src`), quote rows `9`, align rows `12`. Check the row's `version` before reading its shape;
a different one is a different shape. A parts list's `code` is the compat key plus a hash of all the building code: it
changes with any builder change, so use it to know a list was rebuilt, not to decide compatibility.

`importLanguagePack` can skip a derived layer of another version because the app rebuilds it from the source. A plain
reader that reads `prepared` rows directly cannot rebuild them: for such a reader a `prepared` mismatch is fatal, and
a `quote` or `align` mismatch means showing the note's own quote without the gateway words.

## Parts (format 2.0)

A language is cut into content-addressed parts of about 250 KB: per book (text, original, MACULA, helps, alignments),
TW in 8 groups, TA by manual, titles, lexicons by ranges of 1,000 Strong's numbers, OBS ten stories at a time. Each part
is `parts/<sha256>.part.gz`, deterministic gzip of JSONL rows `{"layer", "key", "value"}` (no receipts, no
timestamps). A parts list (`schema: 2`) names them all with their `kind`, `resource`, `book` or `group`, `layers`,
`bytes` and a `fingerprint` of their inputs; an unchanged part keeps its hash and is never built or downloaded again.
Readers skip a part of a kind, layer or index version they do not know.

A real entry of the English list (`/v2/packs/f2.0-u2.3.0-p6000230-q9-a12-t1/en`), Titus's notes:

```json
{ "sha256": "111a888bb7c86bcc93a80fc63165c9494de67a6fbab44283824525f4f759caa4", "bytes": 83567, "rows": 14,
  "kind": "book", "resource": "unfoldingWord/en/tn", "book": "tit", "layers": ["sot", "prepared", "quote"],
  "fingerprint": "b28ad28c2cd7374d6ca812f6030f697e94a801fdb195b246f57d6091e3b4105e" }
```

The list also carries `code` (the compat key plus a hash of the building code), `versions`, `resources` (each with
its catalog row in `metadata`, where `contentMetadata.bookBlobs` gives the book stamps), `stamps`, `units` (`shared`,
`book tit`… with a fingerprint each) and `originals`: the path and the sha256 of the originals list its quotes were made
against. That sha256 is of the originals list file's bytes; fetch it at `{compat}/originals/{sha256}` and check it.
An originals list has `language: "originals"` and the same shape. A device keeps the units it chose: `shared` (TW,
TA, lexicons, titles) and `book {code}` for each book, which brings that book's text, helps and alignments, and from
the originals list that book's original and MACULA.

## The word index

Language packs v3 add an optional `index` layer, one part kind `index`, version `versions.index.helpsIndex`
(`HELPS_INDEX_VERSION`, 1). It is optional: a reader that does not state the version skips it and loses nothing else.

```
index:verses:{original}:{book}          { v, stamp, words: <count>, verses: "1:1 1:2 …", starts: <word list> }
index:strong:{original}:{code}:{book}   { v, stamp, lemma, words: <word list> }
```

- Words of a book are numbered from 0 in document order, chapter 1 on (chapter 0, the headings, is not numbered).
- A verse is listed when its first word comes; `starts[i]` is the number of the first word of `verses[i]`.
- `code` is the lexicon's: `G5485` (the UGNT's last digit dropped, no padding), `H0776` (four digits, a homonym
  letter kept, particle prefixes like `c:` and `d:` dropped). One word can carry two codes.
- A word list is the sorted numbers, each written as `gap - 1` from the previous (the first from −1), in unsigned
  LEB128, then standard base64 with padding. `encodeWords` / `decodeWords` in `packages/language-pack/src/wordIndex`.
- `stamp` is the book's content stamp: index rows travel and are replaced with their book.

To answer "every verse with G5485": read `index:strong:{ugnt}:G5485:*`, decode each book's words, and map each to its
verse with `index:verses:{ugnt}:{book}`. The gateway rendering at each verse comes from that book's `alignmentMap`. TA
articles and TW links across books come from the prepared notes and links of each book on the device.

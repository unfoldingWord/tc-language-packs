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

`{resource}` is `encodeURIComponent(key)` with `%` written `~` (`es-419_gl~2Fes-419~2Fglt`). File names are for people;
the real key is inside each row. Large layers are big unzipped (the Hebrew source is 82 MB): read lines as a stream.

## The manifest

```json
{
  "format": "bt-synergy-language-pack",
  "formatVersion": "1.1.0",
  "language": "es-419",
  "kind": "book",
  "books": ["tit"],
  "requires": [{ "key": "unfoldingWord/el-x-koine/ugnt", "stamp": "v0.34#2023-09-27T02_19_31Z" }],
  "createdAt": "2026-10-20T13:35:31.339Z",
  "layers": ["receipt", "sot", "prepared", "quote", "align", "text"],
  "versions": { "sot": { "usjProcessing": "2.3.0-usj" }, "prepared": { "scripturePrepare": 6000230 },
                "quote": { "helpsQuote": 9 }, "align": { "helpsAlign": 12 }, "text": { "helpsText": 1 } },
  "resources": [{ "key": "es-419_gl/es-419/glt", "role": "language", "stamp": "v42#2026-08-11T12_22_03Z",
                  "subject": "Aligned Bible", "title": "Texto Puente Literal", "rows": { "sot": 5, "prepared": 7 },
                  "books": ["3jn", "est", "jon", "neh", "rut", "tit"] }]
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

Useful shapes:

- `alignmentMap["TIT 1:1"]` is a list of `{ sources: [{ strong, lemma, morph, content, occurrence }], targets: [{ word,
  occurrence }] }`: which gateway words translate which original words.
- An original's USJ word is `{ "marker": "w", "content": ["Παῦλος"], "lemma": "Παῦλος", "strong": "G39720", "x-morph": … }`.
- A prepared notes row: `{ id, reference, quote, occurrence, note, supportReference, tags }`, where `note` writes line
  breaks as the two characters `
` (TSV), and `occurrence` is `1`, `2`… for one occurrence of the quote in the
  verse, `-1` for every occurrence and `0` for a note with no quote; a links row:
  `{ id, reference, origWords, occurrence, twLink, articlePath }`; a questions row: `{ id, reference, question, response }`.
- A lexicon entry: `{ brief, long, entries: [{ strong, lemma, pos, senses: [{ glosses, definition, domain, refs }] }] }`,
  where `refs` maps a book code to `"1:7,9;2:3"`.

## Kinds of pack

| Kind | Holds | es-419, Oct 2026 |
|---|---|---|
| `originals` | UGNT, UHB, MACULA. The same for every language. | 22.9 MB |
| `language` | Every resource of the language, whole, with receipts. No originals. | 8.3 MB |
| `base` | TW, TA, lexicons, OBS whole; catalog rows and book lists of the book-scoped resources. | 8.5 MB |
| `book` | The texts, notes, questions and links of the named books. No receipts. | 7–518 KB |

## Versions

Three, answering three questions:

1. Can I read this file? `formatVersion`.
2. Is this copy newer than mine? Each resource's `stamp`. Never replace a newer copy with an older one.
3. Can I use its rows? `versions`: the code version that made each layer. A different `sot` or `receipt` version means
   the reader cannot use the pack; a different derived version means that layer is skipped and rebuilt.

`compatKeyOf(formatVersion, versions)` makes a key such as `f1.1-u2.3.0-p6000230-q9-a12-t1`; servers keep packs under
it and an app asks only for its own. Parts use format 2.0, so their key starts with `f2.0`. These versions move with
the code: the es-419 packs of 20 October 2026 are `p5000230-q7-a10`, those of 29 October `p6000230-q9-a12`. To know
whether a pack fits an app, compare the pack's key with the one the app's own constants make; `langpack.py info`
prints the pack's.

## Parts (format 2.0)

A language is cut into content-addressed parts of about 250 KB: per book (text, original, MACULA, helps, alignments),
TW in 8 groups, TA by manual, titles, lexicons by ranges of 1,000 Strong's numbers, OBS ten stories at a time. Each part
is `parts/<sha256>.part.gz`, deterministic gzip of JSONL rows `{"layer", "key", "value"}` (no receipts, no
timestamps). A parts list (`schema: 2`) names them all with their `kind`, `resource`, `book` or `group`, `layers`,
`bytes` and a `fingerprint` of their inputs; an unchanged part keeps its hash and is never built or downloaded again.
Readers skip a part of a kind, layer or index version they do not know.

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

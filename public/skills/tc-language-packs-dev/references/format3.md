# Format 3: stories, families and pictures

Format 3 is the newer pack: a signed **catalog** per language lists **units** (a book, the stories, the articles, the
maps), each made of content-addressed **segments**. The common catalog (`common`) holds what every language shares:
the originals, the map of the whole Bible (`xmap`) and the topics (`xtopics`). Apps read it with
`@bt-synergy/language-pack-client` (tC Study, `packages/language-pack-client`). The specification is
`packages/language-pack-v3/spec` in github.com/unfoldingWord/tc-study; this page covers what was added in November 2026.
All of it is published on the test server only (`https://translation-helps-mcp-v2-preview.unfoldingword.workers.dev`,
routes `/v3/packs/{lang}/catalog` and `/v3/packs/seg/{sha256}`, publisher key `78d2e6299a2de4d0`).

```ts
import { createClient, httpSource, indexedDbStore } from '@bt-synergy/language-pack-client'
const client = createClient({ store: await indexedDbStore({ name: 'packs' }), source: httpSource({ base: SERVER }), trust })
await client.install('en', { books: ['gen'], defaults: true, units: ['obs'] })
const reader = await client.open('en')
```

Every new table is optional. A reader that does not know a table skips it, so older apps read the same packs as before.

## Five Movements (5M) of Open Bible Stories

The `obs` unit of a language can carry the Five Movements session of each story, from the OBS Theological Formation
manual of that language: six tables in the `obs` segment, all version 1 (`spec/cddl/obs.cddl`).

| Table | What it holds |
| --- | --- |
| `tf-parts` | The parts of each story's session in order (`intro`, `frames`, `community`, `m1`, `m2`, `drafting`, `m3`, `checking`, `m4`, `m5`, `conclusion`) and their lists; its `stories` column is the **coverage**, the stories that have a session. The root of the set: without it, the other five are ignored |
| `tf-questions` | Observation, discourse, theology and journal questions, with the frames each names and the manual's answer (observation and discourse) |
| `tf-terms` | The translation terms of Movement 1, frame by frame |
| `tf-shared` | Blocks the stories share (drafting, checking, M4, M5, the conclusion, the Community Study sections), stored once |
| `tf-frames` | Frame text from the manual where the language's OBS lacks a frame. Absent in en and id |
| `tf-framework` | The five movements by code, with the framing text of the method |

Coverage on the test server: **English, all 50 stories** (manual `en_obs-tf` v4); **Indonesian, stories 1 to 16**
(`id_obs-tf` v0.1.0, a draft). The frames, titles and images are not repeated: they come from the language's own OBS.
English `obs` with 5M is about 560 KB; Indonesian about 350 KB.

```ts
const s = await reader.obsSession(1)    // null: no tables, or the story is outside the coverage
// s.title "1. The Creation", s.release "v4", s.coverage [1..50], s.frames [{ n, id: 101, text, source: 'obs' }]
// s.parts [{ code: 'm1', lists: [{ code: 'observation', questions: [{ id: '1/m1/1', q, a, frames: [101] }] }] }, …]
const m1 = await reader.obsPart(1, 'm1') // one part by its fixed code; null when absent
```

`obsSession` and `obsPart` return plain data, not an `Answer` envelope. Question ids (`1/m1/3`) and term ids (`1:1/2`)
are positional: they hold only for the `release` of the session. An app that saves a note against one must keep the
release and a hash of the question text with it.

License: CC BY-SA 4.0. Credit: «unfoldingWord and Formation Stories». A derived work never carries the unfoldingWord® mark.

## The verses of each story frame (`obs-frames`)

The `xtopics` core of the common catalog has a table `obs-frames`: for each frame `N:F`, the verse ranges it tells, from
Bible Story Builder (`bcv-commons/bible-story-builder`, MIT, unfoldingWord Box3). Each range is inside one chapter.

```ts
const fv = await reader.frameVerses(4, 1)
// fv.data.ranges -> [{ book: 'gen', ref: '11:1-2', first: 1011001, last: 1011002 }, { book: 'gen', ref: '11:4', … }]
const at = await reader.framesAt(1001010)   // Genesis 1:10 -> the frames that tell it, most specific first
```

A verse id is `LLCCCVVV`: book number (Genesis 1, Matthew 40, Titus 56), chapter, verse.

## Story pictures (`zxx-obsimg`)

The 598 Open Bible Stories pictures are the same for every language, so they live in a catalog of their own,
`zxx-obsimg` (`zxx`: no linguistic content), unit `obsimg`, one segment per story (200 to 700 KB each, 21.1 MB in all,
WebP). No language catalog requires it and no client installs it by default: a person asks for it.

```ts
await client.install('zxx-obsimg', { units: ['obsimg'] })
const pics = await client.open('zxx-obsimg')
const img = await pics.obsImage(1, 1)       // { bytes, media: 'image/webp', w, h } or null
const credit = await pics.obsImageCredit()  // { license: 'CC BY-SA 3.0', credit: 'Illustrations © Sweet Publishing, …', changes, source }
```

Show the credit wherever the pictures are shown.

## People and families

People, places and the family relations (`parent-of`, `sibling-of`, `partner-of`) come from TIPNR in the `xtopics`
core. ACAI adds only what TIPNR lacks, and nothing is stored that the pack can already give:

- **`gender`** (`xtopics` core, v1): one number per row of `topics.ids`: 0 no data, 1 man, 2 woman. Under 1 KB.
- **More `same-as` rows** (`xtopics` core): a Translation Words article on a name that the TIPNR rule joined to no one
  can be joined by ACAI (source ACAI, confidence 75); one article may then name several people ("Abijah").
- **`people`** (`topics` core of each language, v1): `names` (a person's name where the pack cannot derive it),
  `notes` (what tells two people of the same name apart, "padre de José") and `aliases` (other names). Built for en,
  es-419, id, hi and ar (French has no format 3 catalog yet) when ACAI names the person; 14 to 42 KB per language.

The name an app shows for a person: `people.names`, else the first name in the language's map of the Translation Words
article joined by `same-as`, else the English title (`spec/ids.md`, "Names of people").

The relations carry no verse. The client works out a verse that shows each one from the verses of the two people in
the `xtopics` parts (`kinVerses`): their first three shared verses, else the closest pair at most three verses apart in
one chapter, else none. Every client gives the same answer (`spec/tests/parentescos/versiculos.json`).

```ts
const f = await reader.family('per:isaac')   // es-419
// f.data -> { id, name: 'Isaac', gender: 1, verses, tw: [the tW articles joined to him],
//   parents: [{ id: 'per:sarah', name: 'Sara', gender: 2, verses: [[1017019, 1017019], …] }, …],
//   children: [{ id: 'per:esau', name: 'Esaú', … }, …], partners: […], siblings: [{ …, half: true }] }
const everyone = await reader.people()      // [{ id, name, note?, gender?, names: [...], verses }] to search by name
import { kinVerses } from '@bt-synergy/language-pack-client'
kinVerses(versesOfA, versesOfB)             // the same rule, for your own data
```

`family` reads the core and only the parts of the books it needs; `half` is set on a sibling only when the data proves it.

Credits: STEPBible TIPNR (CC BY 4.0) for people and relations; Theographic Bible Metadata (CC BY-SA 4.0) for events;
«ACAI Biblical Entity Data © 2024 BiblioNexus», CC BY-SA 4.0, for gender, names and aliases.

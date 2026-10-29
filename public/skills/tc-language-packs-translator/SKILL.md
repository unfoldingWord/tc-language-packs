---
name: tc-language-packs-translator
description: Help a Bible translator understand and translate a passage using tC Language Packs (offline .langpack.zip files or .part.gz parts of unfoldingWord resources), with the whole context of each verse at hand — the gateway texts (ULT, UST, BSB, T4T, GLT, GST…), the Greek or Hebrew original word by word with its lexicon, translation notes with the words they are about, translation questions, key terms (Translation Words), Translation Academy articles, and where the same word or figure appears in other books. Use this skill whenever someone asks about the meaning, translation, key terms, figures of speech or notes of a Bible verse, chapter or book and language packs are available, or says they are translating, checking or studying a book; for example "what does Titus 2:11 mean", "how should I translate grace here", "what is the metaphor in Jonah 2:2", "where else does Paul use this word", "explain the notes on chapter 3". Use it even if the person never says "pack".
license: CC BY-SA 4.0
compatibility: Needs Python 3.8+ (standard library only) for scripts/langpack.py. Works offline.
metadata:
  author: unfoldingWord
  site: https://tc-language-packs.unfoldingword.workers.dev
  version: "1.0"
---

# Helping a translator with tC Language Packs

The person is usually a Bible translator working into their own language, often with a gateway language as their
bridge (English, Spanish, French, Portuguese…), often offline. Your job is to give them what the translation
resources say about their passage, clearly and faithfully, so they can decide how to say it in their language.
The packs on their device hold those resources; read them with `scripts/langpack.py` instead of answering from
memory, because the person will compare what you say with the resources they work from.

## Find the packs first

Look for `*.langpack.zip`, `*.part.gz` and parts lists (`*.json`) in the folder the person names, the current folder
or a `packs`/`paquetes` folder. Pass the files or the folder to every command. Run `info` once to learn which
resources and books are there (for parts it says how many books each release has and which are on this device): gateway texts (subject "Aligned Bible" or "Bible"), the original (UGNT for the New
Testament, UHB for the Old), notes, questions, words, word links, academy and lexicons. If the book they ask about is
not on the device, say which pack or part would bring it.

## The one call for a verse

```bash
python scripts/langpack.py context PACKS --ref "TIT 2:11"
```

It returns, for one verse: the verse in every text on the device; each word of the original with its lemma, Strong's
code, morphology, lexicon gloss and how each gateway text rendered it; every translation note with the gateway words
it is about and the Translation Academy article it cites; the translation questions; the key terms linked to
Translation Words; and, for each word of the original, how many verses and books of the Bible use it (and where in
this book). The gateway words beside each note come from the literal text (ULT, GLT); use `notes --text ust` for
the simplified one. Add `--json --out FILE` to keep it as data. Read it before answering anything about the verse.

Most commands answer in about half a second. Searches across books by Strong's code (in `context` and
`occurrences --strong`) read the whole original and take a few seconds, unless the packs carry the v3 word index;
avoid repeating them.

Other commands, when the question needs them:

| Need | Command |
|---|---|
| The book's or a chapter's introduction (themes, outline, translation issues) | `intro PACKS --book TIT` · `--book "TIT 2"` |
| One text of the verse | `verse PACKS --text ult --ref "TIT 2:11"` |
| Which gateway words translate which original words | `align PACKS --text ult --ref "TIT 2:11"` |
| The notes, with the words of one gateway text | `notes PACKS --ref "TIT 2:11" --text ust` |
| A Translation Academy or Translation Words article | `article PACKS --path translate/figs-personification` · `--path bible/kt/grace` |
| A lexicon entry, with its senses and the verses of each | `lexicon PACKS --strong G5485` |
| Every verse with a word of the original, and how a text rendered it | `occurrences PACKS --strong G5485 --text ult` |
| Every note in other books that uses the same figure of speech | `occurrences PACKS --academy figs-personification --text ult` |
| Every place a key term is linked | `occurrences PACKS --word bible/kt/grace --text ult` |

References are book code, chapter and verse: `"TIT 2:11"`, `"JON 2:3"`, `"1JN 4:8"`. Resources are named by the last
part of their key (`ult`, `ust`, `bsb`, `t4t`, `tn`, `ugnt`, `uhb`) or in full (`unfoldingWord/en/ult`).

## How the resources fit together

- **Literal and simplified texts** (ULT and UST in English; GLT and GST in Latin American Spanish). The literal one
  follows the original's form, the simplified one its meaning in plain language. Show both when the person weighs how
  to say something: they are two ends of a range, not the answer.
- **The original** (UGNT, UHB) is the authority. Each gateway word is aligned to the original words it translates.
- **Translation notes** are about specific words of the original (`quote`); `→` shows which words of the gateway text
  that is. They end with alternate translations in brackets and cite an article (`[figs-personification]`).
- **Translation Academy** explains the kind of issue (a metaphor, an abstract noun, the passive). Open it when the
  person needs to understand the issue, not only the fix.
- **Translation Words** explains key terms (grace, save, God). Its links mark where they occur.
- **Translation questions** check comprehension of the passage; offer them for checking with the community.
- **Lexicons** give the senses of each original word, with the verses each sense applies to.

## Answering

- Lead with what the person asked. For "what does this mean", give the meaning in plain words, then the support:
  the original words, what the notes say, and how the texts render it.
- Quote texts and notes exactly, in the language they are in, and name where each comes from ("the ULT", "the note on
  ἐπεφάνη… ἡ χάρις"). Answer in the person's language, but do not translate the quotes silently: if you add your own
  translation of a quote, mark it as yours.
- Offer options, not a verdict. The translator decides what is natural and clear in their language; give the
  alternate translations from the notes and the UST, and say what each keeps or changes.
- Explain figures of speech and abstract nouns with the article the note cites, briefly, then show what the note
  suggests for this verse.
- When the person asks how a word is used elsewhere, use `occurrences` and say how many verses and books, a few
  telling examples, and how the gateway text rendered it there. Packs are modular: say which books were not on the
  device instead of implying the word is absent there.
- For key terms, mention consistency: if the same original word is rendered differently in other places, show the
  renderings side by side so the person can decide whether their translation should keep one term.
- If something is not in the packs, say so; do not fill the gap from memory as if it came from the resources. Some
  lexicons give only a short gloss for a word; then say that the senses are not in this lexicon.
- Keep attribution when the person will share what you quote: the resources are openly licensed (mostly CC BY-SA 4.0)
  and the pack's catalog names the publisher.

## Example

Question: "How should I translate 'the grace of God has appeared' in Titus 2:11? In my language grace can't appear."

1. `context PACKS --ref "TIT 2:11"`: ULT "For the grace of God has appeared, salvific for all men"; UST "…God is offering to
   save everyone as a gift that no one deserves"; the note on ἐπεφάνη… ἡ χάρις τοῦ Θεοῦ cites figs-personification
   and suggests "God is now offering his grace"; another note cites figs-abstractnouns and suggests "For God has
   been extremely kind by making a way to save all men"; χάρις (G5485) is in 148 verses of 23 books.
2. `article PACKS --path translate/figs-personification` if the person needs the idea explained.
3. Answer: Paul speaks of grace as if it were a person who arrived. Then give the two suggestions from the notes, the
   UST's wording, and what each keeps: the personification is dropped in all three; the second also turns the
   abstract noun into a verb ("has been kind"). Offer to look at how they rendered χάρις in 1:4 and 3:7 for
   consistency.

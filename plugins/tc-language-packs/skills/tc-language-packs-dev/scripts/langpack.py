#!/usr/bin/env python3
"""Read Bible translation language packs offline, with the Python standard library only.

A source is any mix of: a `.langpack.zip` file, a `.part.gz` file (format 2.0 parts), a parts list (`.json`, schema 2,
which names the resources the parts belong to), or a folder holding them. Give several when a language is split
(for example `originals.langpack.zip en-base.langpack.zip en-tit.langpack.zip`, or a folder of parts with its lists).

  langpack.py info      SOURCE...                        what the packs bring
  langpack.py keys      SOURCE... [--layer L] [--resource R] [--prefix P] [--limit N]
  langpack.py row       SOURCE... --key KEY              one raw row, as JSON
  langpack.py verse     SOURCE... --text glt --ref "TIT 1:1"
  langpack.py align     SOURCE... --text glt --ref "TIT 1:1"   which original words each target word translates
  langpack.py notes     SOURCE... --ref "TIT 1:1" [--notes tn] [--text glt] [--intro]
  langpack.py questions SOURCE... --ref "TIT 1:1" [--questions tq]
  langpack.py links     SOURCE... --ref "TIT 1:1" [--links twl]  Translation Words links of a verse
  langpack.py article   SOURCE... --path translate/figs-metaphor | bible/kt/grace
  langpack.py lexicon   SOURCE... --strong G5485 | H2580
  langpack.py context   SOURCE... --ref "TIT 2:11"                 everything about a verse, and where its words reach
  langpack.py intro     SOURCE... --book TIT | "TIT 2"              the introduction to a book or a chapter
  langpack.py occurrences SOURCE... --strong G5485 [--text glt]     every verse of the Bible with this word, and its rendering
  langpack.py occurrences SOURCE... --academy figs-metaphor         every note that cites a Translation Academy article
  langpack.py occurrences SOURCE... --word bible/kt/grace           every Translation Words link to an article

Add --json to any command for machine-readable output, and --out FILE to write it to a UTF-8 file (safer than a
pipe on Windows, whose console may not be UTF-8). A resource (--text, --notes…) is its full key
(`unfoldingWord/en/ult`) or the last part of it (`ult`).
"""

import argparse
import gzip
import json
import os
import re
import sys
import urllib.parse
import zipfile

LAYERS = ["receipt", "sot", "prepared", "quote", "align", "text", "index"]


def file_safe(key):
    """How a pack names the rows file of a resource: encodeURIComponent, with % written ~."""
    return urllib.parse.quote(key, safe="-_.!~*'()").replace("%", "~")


class Sources:
    """Every pack and part given, read lazily: a zip's rows file is opened only when a command needs it."""

    def __init__(self, paths):
        self.zips = []  # (path, ZipFile, manifest)
        self.parts = []  # paths of .part.gz
        self.lists = []  # (path, parts list) of format 2.0
        for p in paths:
            self._add(p)
        if not self.zips and not self.parts:
            sys.exit("No .langpack.zip or .part.gz found in: " + ", ".join(paths))
        self._part_rows = None
        self._entry_of = {}

    def _add(self, p):
        if os.path.isdir(p):
            for name in sorted(os.listdir(p)):
                if name.endswith(".langpack.zip") or name.endswith(".part.gz") or name.endswith(".json"):
                    self._add(os.path.join(p, name))
            return
        if p.endswith(".part.gz"):
            self.parts.append(p)
            return
        if p.endswith(".json"):
            try:
                with open(p, encoding="utf-8") as f:
                    lst = json.load(f)
            except (OSError, ValueError):
                return
            if isinstance(lst, dict) and lst.get("schema") == 2 and isinstance(lst.get("parts"), list):
                self.lists.append((p, lst))
            return
        z = zipfile.ZipFile(p)
        try:
            manifest = json.loads(z.read("manifest.json"))
        except KeyError:
            sys.exit(p + " is not a language pack: it has no manifest.json")
        if manifest.get("format") != "bt-synergy-language-pack":
            sys.exit(p + " is not a language pack: format is " + str(manifest.get("format")))
        self.zips.append((p, z, manifest))

    def manifests(self):
        return [(p, m) for p, _, m in self.zips]

    def resources(self):
        """Every resource key any pack names, with the manifest entry that names it first."""
        seen = {}
        for _, _, m in self.zips:
            for r in m.get("resources", []):
                seen.setdefault(r["key"], r)
        for _, lst in self.lists:
            for r in lst.get("resources", []):
                seen.setdefault(r["key"], r)
        return seen

    def _entries(self):
        """What the parts lists say of each part file given (by its sha256): its resource, book and layers."""
        if self._part_rows is None:
            self._part_rows = {}
            by_sha = {e["sha256"]: e for _, lst in self.lists for e in lst["parts"]}
            self._entry_of = {p: by_sha.get(os.path.basename(p)[: -len(".part.gz")]) for p in self.parts}
        return self._entry_of

    def _part_file(self, p):
        """The rows of one part file, read once."""
        if p not in self._part_rows:
            got = []
            with gzip.open(p, "rt", encoding="utf-8") as f:
                for line in f:
                    if line.strip():
                        r = json.loads(line)
                        got.append((r["layer"], r["key"], r["value"]))
            self._part_rows[p] = got
        return self._part_rows[p]

    def parts_on_device(self):
        """The list entries of the part files given."""
        return [e for e in self._entries().values() if e]

    def rows(self, layer, resource=None):
        """(key, entry) of a layer, of one resource or of all."""
        for _, z, _ in self.zips:
            names = z.namelist()
            if resource:
                wanted = ["rows/%s/%s.jsonl" % (layer, file_safe(resource))]
            else:
                wanted = [n for n in names if n.startswith("rows/%s/" % layer) and n.endswith(".jsonl")]
            for n in wanted:
                if n not in names:
                    continue
                with z.open(n) as f:
                    for line in f:
                        if line.strip():
                            r = json.loads(line)
                            yield r["key"], r["entry"]
        # With parts lists, open only the parts of this resource and layer; without them, every part.
        for p, entry in self._entries().items():
            if entry and (layer not in entry.get("layers", []) or (resource and entry.get("resource") != resource)):
                continue
            for l, k, v in self._part_file(p):
                if l == layer and (resource is None or resource_of(k) == resource):
                    yield k, v

    def find(self, layer, resource, key):
        for k, e in self.rows(layer, resource):
            if k == key:
                return e
        return None


def resource_of(key):
    """The resource a row key belongs to, best effort (for parts, which have no per-resource files)."""
    m = re.match(r"^(?:resource|scripture-usj|tn|tq|twl|obs):([^:]+/[^:]+/[^:]+)", key)
    if m:
        return m.group(1)
    m = re.match(r"^prepared:[^:]+:([^:]+/[^:]+/[^:]+):", key)
    if m:
        return m.group(1)
    m = re.match(r"^helps-(?:quote|align):([^@]+)@", key)
    if m:
        return m.group(1)
    m = re.match(r"^index:[^:]+:([^:]+/[^:]+/[^:]+):", key)
    if m:
        return m.group(1)
    m = re.match(r"^helps-text:[^:]+:([^@]+)@", key)
    if m:
        return m.group(1)
    parts = key.split("/")
    return "/".join(parts[:3]) if len(parts) > 3 else None


def pick(sources, wanted, subjects):
    """A resource key from a full key or its last part; otherwise the first resource of one of these subjects."""
    res = sources.resources()
    if wanted:
        if wanted in res:
            return wanted
        hits = [k for k in res if k.split("/")[-1] == wanted]
        if not hits:
            hits = [k for k in res if k.endswith("/" + wanted) or k.split("/")[-1].endswith(wanted)]
        if not hits:
            sys.exit("No resource %r. The packs have: %s" % (wanted, ", ".join(sorted(res))))
        if len(hits) > 1:
            print("note: %r matches %s; using %s" % (wanted, ", ".join(hits), hits[0]), file=sys.stderr)
        return hits[0]
    hits = [k for k, r in res.items() if r.get("subject") in subjects]
    if not hits:
        sys.exit("No resource of subject %s in these packs" % " / ".join(subjects))
    return hits[0]


REF = re.compile(r"^\s*([1-3]?[A-Za-z]{2,3})\s+(\d+):(\d+)\s*$")


def parse_ref(ref):
    m = REF.match(ref)
    if not m:
        sys.exit('A reference is a book code, chapter and verse: "TIT 1:1", "3JN 1:4"')
    return m.group(1).lower(), int(m.group(2)), int(m.group(3))


def covers(reference, chapter, verse):
    """Whether a helps row's reference ("1:1", "1:1-3", "1:intro", "front:intro") is about this verse."""
    m = re.match(r"^(\d+):(\d+)(?:-(\d+))?$", str(reference))
    if not m:
        return False
    c, v1, v2 = int(m.group(1)), int(m.group(2)), int(m.group(3) or m.group(2))
    return c == chapter and v1 <= verse <= v2


def out(args, data, text):
    body = json.dumps(data, ensure_ascii=False, indent=2) if args.json else text
    if getattr(args, "out", None):
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(body + "\n")
        print("wrote " + args.out)
    else:
        print(body)


def compat_key(m):
    """bt-synergy's compatKeyOf: the format and the five code versions that decide whether rows can be used as they are."""
    v = m.get("versions") or {}
    parts = [v.get("sot", {}).get("usjProcessing"), v.get("prepared", {}).get("scripturePrepare"), v.get("quote", {}).get("helpsQuote"),
             v.get("align", {}).get("helpsAlign"), v.get("text", {}).get("helpsText")]
    if any(p in (None, "") for p in parts):
        return None
    major, minor = (str(m.get("formatVersion", "0.0")).split(".") + ["0"])[:2]
    return "f%s.%s-u%s-p%s-q%s-a%s-t%s" % (major, minor, re.sub(r"-usj$", "", str(parts[0])), *parts[1:])


# Commands


def cmd_info(s, a):
    data = []
    lines = []
    for p, m in s.manifests():
        data.append(m)
        lines.append("%s" % os.path.basename(p))
        kind = m.get("kind", "language")
        who = ("for every language (made in the %s run)" % m["language"]) if kind == "originals" else "language " + m["language"]
        lines.append("  %s %s · kind %s · %s%s" % (m["format"], m["formatVersion"], kind, who,
                                                  " · books " + ",".join(m["books"]) if m.get("books") else ""))
        if m.get("requires"):
            lines.append("  requires " + ", ".join("%s %s" % (r["key"], r["stamp"]) for r in m["requires"]))
        lines.append("  versions " + json.dumps(m.get("versions", {})))
        key = compat_key(m)
        if key:
            m = dict(m, compat=key)
            data[-1] = m
            lines.append("  compat %s  (an app reads its rows as they are only if its own key is the same)" % key)
        for r in m["resources"]:
            rows = ", ".join("%s %d" % (k, v) for k, v in r.get("rows", {}).items()) or "catalog row only"
            lines.append("  - %s · %s · %s · %s (%s)%s" % (r["key"], r.get("title", ""), r.get("subject", ""), r["stamp"], rows,
                                                          " · books " + ",".join(r["books"]) if r.get("books") else ""))
    for p, lst in s.lists:
        data.append({k: v for k, v in lst.items() if k != "parts"})
        lines.append("%s" % os.path.basename(p))
        lines.append("  parts list (schema 2) · language %s · compat %s · %d parts, %.1f MB" % (
            lst.get("language"), lst.get("compat"), len(lst["parts"]), sum(x.get("bytes", 0) for x in lst["parts"]) / 1e6))
        here = {}
        for e in s.parts_on_device():
            if e.get("book"):
                here.setdefault(e["resource"], set()).add(e["book"])
        for r in lst.get("resources", []):
            books = r.get("books") or []
            on = sorted(here.get(r["key"], set()), key=book_rank)
            lines.append("  - %s · %s · %s · %s%s" % (r["key"], r.get("title", ""), r.get("subject", ""), r.get("stamp", ""),
                                                     " · %d books in the release, on this device: %s" % (len(books), few(on) if on else "none")
                                                     if books else ""))
    if s.parts:
        lines.append("%d part file(s) given" % len(s.parts))
    out(a, data, "\n".join(lines))


def cmd_keys(s, a):
    layers = [a.layer] if a.layer else LAYERS
    resource = pick(s, a.resource, []) if a.resource else None
    keys = []
    for layer in layers:
        for k, _ in s.rows(layer, resource):
            if not a.prefix or k.startswith(a.prefix):
                keys.append((layer, k))
                if len(keys) >= a.limit:
                    break
        if len(keys) >= a.limit:
            break
    out(a, [{"layer": l, "key": k} for l, k in keys], "\n".join("%-9s %s" % (l, k) for l, k in keys))


def cmd_row(s, a):
    for layer in LAYERS:
        for k, e in s.rows(layer, resource_of(a.key)):
            if k == a.key:
                print(json.dumps({"layer": layer, "key": k, "entry": e}, ensure_ascii=False, indent=2))
                return
    sys.exit("No row with key " + a.key)


def light_chapter(s, text, book, chapter):
    e = s.find("prepared", text, "prepared:scripture:%s:%s:%d:light" % (text, book, chapter))
    return (e or {}).get("content") if isinstance(e, dict) else None


def cmd_verse(s, a):
    text = pick(s, a.text, ["Aligned Bible", "Bible", "Greek New Testament", "Hebrew Old Testament"])
    book, ch, v = parse_ref(a.ref)
    chapter = light_chapter(s, text, book, ch)
    if not chapter:
        sys.exit("%s has no prepared chapter %s %d in these packs (is the book's pack given?)" % (text, book, ch))
    words, inside = [], False
    for block in chapter["blocks"]:
        for i in block["inline"]:
            if i["kind"] == "verse":
                inside = i["chapterNumber"] == ch and i["verseNumber"] == v
            elif inside and i["kind"] == "text":
                words.append(i["text"])
    verse = re.sub(r"\s+", " ", "".join(words)).strip()
    if not verse:
        sys.exit("No verse %s in %s" % (a.ref, text))
    out(a, {"resource": text, "ref": a.ref, "text": verse}, verse)


def cmd_align(s, a):
    text = pick(s, a.text, ["Aligned Bible"])
    book, ch, v = parse_ref(a.ref)
    e = s.find("sot", text, "scripture-usj:%s:%s:%d" % (text, book, ch))
    if not e:
        sys.exit("%s has no chapter %s %d in these packs" % (text, book, ch))
    amap = (e.get("content") or {}).get("alignmentMap") or {}
    rows = amap.get("%s %d:%d" % (book.upper(), ch, v))
    if rows is None:
        sys.exit("No alignment for %s in %s" % (a.ref, text))
    lines = ["%s  ←  %s" % (" ".join(t["word"] for t in r["targets"]),
                             " ".join("%s (%s, %s)" % (src["content"], src.get("lemma", ""), src.get("strong", "")) for src in r["sources"]))
             for r in rows]
    out(a, rows, "\n".join(lines))


def helps_chapter(s, kind, resource, book, ch):
    e = s.find("prepared", resource, "prepared:%s:%s:%s:%d:light" % (kind, resource, book, ch))
    return (e or {}).get("content") if isinstance(e, dict) else None


def is_intro(n):
    """A book or chapter introduction: the notes' first rows, with no quote, kept apart from the verse's notes."""
    return bool(n.get("isIntro")) or (not n.get("quote") and str(n.get("note", "")).lstrip().startswith("#"))


def unescape(text):
    """Notes come from TSV, which writes a line break as the two characters backslash and n."""
    return str(text or "").replace("\\n", "\n")


def plain(text):
    return re.sub(r"\s+", " ", unescape(text)).strip()


def joined(row):
    """The target words of an aligned quote, with … where they are not next to each other."""
    words, places, outw = row.get("t", []), row.get("p", []), []
    for i, w in enumerate(words):
        if i and i < len(places) and places[i] != places[i - 1] + 1:
            outw.append("…")
        outw.append(w)
    return " ".join(outw)


def cmd_notes(s, a):
    notes = pick(s, a.notes, ["TSV Translation Notes"])
    book, ch, v = parse_ref(a.ref)
    chapter = helps_chapter(s, "notes", notes, book, ch)
    if not chapter:
        sys.exit("%s has no prepared notes for %s %d in these packs" % (notes, book, ch))
    found = [n for n in chapter["notes"] if covers(n.get("reference"), ch, v) and (a.intro or not is_intro(n))]
    aligned = {}
    if a.text:
        text = pick(s, a.text, [])
        for k, e in s.rows("align", notes):
            if ":%s@" % text in k and k.endswith(":%s:%d" % (book, ch)):
                aligned = e.get("content", {}) if isinstance(e, dict) else {}
                break
    data, lines = [], []
    for n in found:
        words = joined(aligned.get(n["id"], {})) if aligned else ""
        d = {k: n.get(k) for k in ("id", "reference", "quote", "occurrence", "supportReference")}
        d["note"] = unescape(n.get("note"))
        if a.text:
            d["textQuote"] = words or None
        data.append(d)
        head = "%s %s" % (n["reference"], n["quote"] or "(the whole verse)")
        if words:
            head += "  →  " + words
        lines.append(head + ("  [%s]" % n["supportReference"].split("/")[-1] if n.get("supportReference") else ""))
        lines.append("  " + plain(n.get("note", ""))[:400])
    out(a, data, "\n".join(lines) or "No notes for " + a.ref)


def cmd_questions(s, a):
    tq = pick(s, a.questions, ["TSV Translation Questions"])
    book, ch, v = parse_ref(a.ref)
    chapter = helps_chapter(s, "questions", tq, book, ch)
    if not chapter:
        sys.exit("%s has no prepared questions for %s %d in these packs" % (tq, book, ch))
    found = [q for q in chapter["questions"] if covers(q.get("reference"), ch, v)]
    out(a, found, "\n".join("%s %s\n  %s" % (q["reference"], q["question"], q["response"]) for q in found) or "No questions for " + a.ref)


def cmd_links(s, a):
    twl = pick(s, a.links, ["TSV Translation Words Links"])
    book, ch, v = parse_ref(a.ref)
    chapter = helps_chapter(s, "words-links", twl, book, ch)
    if not chapter:
        sys.exit("%s has no prepared word links for %s %d in these packs" % (twl, book, ch))
    found = [l for l in chapter["links"] if covers(l.get("reference"), ch, v)]
    out(a, found, "\n".join("%s %s → %s" % (l["reference"], l["origWords"], l["articlePath"]) for l in found) or "No links for " + a.ref)


def cmd_article(s, a):
    path = a.path.strip("/")
    for prefix in ("rc://*/tw/dict/", "rc://*/ta/man/"):
        if path.startswith(prefix):
            path = path[len(prefix):]
    kind = "Translation Words" if path.startswith("bible/") else "Translation Academy"
    res = pick(s, a.resource, [kind])
    key = "%s/%s" % (res, path)
    e = s.find("sot", res, key)
    if e is None:
        sys.exit("No article %s in %s" % (path, res))
    body = e if isinstance(e, str) else json.dumps(e, ensure_ascii=False)
    out(a, {"resource": res, "path": path, "markdown": body}, body)


def cmd_lexicon(s, a):
    m = re.match(r"^([GHgh])0*(\d+)[a-z]?$", a.strong.strip())
    if not m:
        sys.exit("A Strong's number looks like G5485 or H2580")
    subject = "Greek Lexicon" if m.group(1).upper() == "G" else "Hebrew Lexicon"
    res = pick(s, a.resource, [subject])
    e = s.find("sot", res, "%s/content/%s.json" % (res, m.group(2)))
    if e is None:
        sys.exit("%s has no entry %s" % (res, a.strong))
    lines = [e.get("brief", "")]
    for entry in e.get("entries", []):
        lines.append("%s %s %s" % (entry.get("lemma", ""), entry.get("strong", ""), ", ".join(entry.get("pos", []))))
        for sense in entry.get("senses", []):
            refs = "; ".join("%s %s" % (b, r) for b, r in (sense.get("refs") or {}).items())
            lines.append("  - %s%s" % (", ".join(sense.get("glosses", [])) or sense.get("definition", ""), ("  (" + refs + ")") if refs else ""))
    if not e.get("entries"):
        lines.append("(this lexicon gives only a short gloss for %s, without senses)" % a.strong)
    out(a, e, "\n".join(lines))


# Across books: the word index (language packs v3)


def strong_codes(strong):
    """The lexicon codes of an original word's `strong`, as bt-synergy's `strongCodesOf`: G54850 → G5485, H853 → H0853."""
    out = []
    for raw in str(strong or "").split(":"):
        part = raw.strip()
        m = re.match(r"^G(\d+)\d$", part)
        if m:
            c = "G%d" % int(m.group(1))
        else:
            m = re.match(r"^H(\d+)([a-z])?$", part)
            if not (m and int(m.group(1))):
                continue
            c = "H%04d%s" % (int(m.group(1)), m.group(2) or "")
        if c not in out:
            out.append(c)
    return out


def normal_code(text):
    m = re.match(r"^([GHgh])0*(\d+)([a-z]?)$", text.strip())
    if not m:
        sys.exit("A Strong's code looks like G5485 or H2580")
    return ("G%d" % int(m.group(2))) if m.group(1).upper() == "G" else ("H%04d%s" % (int(m.group(2)), m.group(3)))


def decode_words(text):
    """bt-synergy's word lists: gaps minus one, unsigned LEB128, base64."""
    import base64
    words, previous, gap, shift = [], -1, 0, 0
    for b in base64.b64decode(text) if text else b"":
        gap |= (b & 127) << shift
        if b & 128:
            shift += 7
            continue
        previous = previous + gap + 1
        words.append(previous)
        gap, shift = 0, 0
    return words


def walk_words(nodes, found):
    """Each `w` of a chapter's USJ, with the verse it is in."""
    for n in nodes or []:
        if not isinstance(n, dict):
            continue
        if n.get("type") == "verse" or n.get("marker") == "v":
            found["verse"] = str(n.get("number"))
        elif n.get("marker") == "w":
            yield found["verse"], n
        for w in walk_words(n.get("content"), found):
            yield w


BOOK_ORDER = ("gen exo lev num deu jos jdg rut 1sa 2sa 1ki 2ki 1ch 2ch ezr neh est job psa pro ecc sng isa jer lam ezk dan hos jol amo oba "
              "jon mic nam hab zep hag zec mal mat mrk luk jhn act rom 1co 2co gal eph php col 1th 2th 1ti 2ti tit phm heb jas 1pe 2pe 1jn 2jn 3jn jud rev").split()


def book_rank(book):
    return BOOK_ORDER.index(book) if book in BOOK_ORDER else 999


def places_of_codes(s, original, codes):
    """Every verse of the original where a word carries one of these codes, in one pass: from the packs' `index` rows
    when they have them, else read from the original's own words (the same answer, slower).
    Returns ({code: {book: [refs]}}, {code: lemma}, how, books searched)."""
    codes = set(codes)
    places = {c: {} for c in codes}
    lemmas = {c: {} for c in codes}
    index_rows = [(k, e) for k, e in s.rows("index", original)]
    verses_rows = {k: e for k, e in index_rows if k.startswith("index:verses:%s:" % original)}
    if verses_rows:
        import bisect
        searched = {k.rsplit(":", 1)[1] for k in verses_rows}
        for k, e in index_rows:
            m = re.match(r"^index:strong:[^:]+/[^:]+/[^:]+:([^:]+):([^:]+)$", k)
            if not m or m.group(1) not in codes or not isinstance(e, dict):
                continue
            code, book = m.group(1), m.group(2)
            vr = verses_rows.get("index:verses:%s:%s" % (original, book))
            if not vr:
                continue
            refs, starts = vr["verses"].split(" "), decode_words(vr["starts"])
            got = []
            for w in decode_words(e["words"]):
                ref = refs[bisect.bisect_right(starts, w) - 1]
                if not got or got[-1] != ref:
                    got.append(ref)
            places[code][book] = got
            if e.get("lemma"):
                lemmas[code][e["lemma"]] = len(got)
        how = "index"
    else:
        searched = set()
        for k, e in s.rows("sot", original):
            m = re.match(r"^scripture-usj:[^:]+/[^:]+/[^:]+:([^:]+):(\d+)$", k)
            if not m or m.group(2) == "0":
                continue
            book, ch = m.group(1), int(m.group(2))
            searched.add(book)
            usj = ((e or {}).get("content") or {}).get("usj") or {}
            for verse, w in walk_words(usj.get("content"), {"verse": "0"}):
                for code in strong_codes(w.get("strong")):
                    if code not in codes:
                        continue
                    ref = "%d:%s" % (ch, verse)
                    lst = places[code].setdefault(book, [])
                    if not lst or lst[-1] != ref:
                        lst.append(ref)
                    if w.get("lemma"):
                        lemmas[code][w["lemma"]] = lemmas[code].get(w["lemma"], 0) + 1
        how = "original"
        for c in places:
            for book in places[c]:
                places[c][book].sort(key=lambda r: tuple(int(x) if x.isdigit() else 0 for x in r.split(":")))
    best = {c: (max(l, key=l.get) if l else "") for c, l in lemmas.items()}
    return places, best, how, searched


def places_of_strong(s, original, code):
    places, lemmas, how, searched = places_of_codes(s, original, [code])
    return places[code], lemmas[code], how, searched


def original_books_missing(s, original, searched):
    """Books of the original's release not on this device (with parts, each book's original comes with that book)."""
    release = s.resources().get(original, {}).get("books") or []
    return sorted((b for b in release if b not in searched), key=book_rank)


def few(books, n=8):
    books = [b.upper() for b in books]
    return ", ".join(books) if len(books) <= n else "%s and %d more" % (", ".join(books[:n]), len(books) - n)


def renderings(s, text, code, places):
    """How a gateway text translated the code at each place it has: the target words aligned to those original words."""
    chapters = {}
    for k, e in s.rows("sot", text):
        m = re.match(r"^scripture-usj:[^:]+/[^:]+/[^:]+:([^:]+):(\d+)$", k)
        if m:
            chapters[(m.group(1), int(m.group(2)))] = ((e or {}).get("content") or {}).get("alignmentMap") or {}
    out = {}
    for book, refs in places.items():
        for ref in refs:
            ch = int(ref.split(":")[0])
            amap = chapters.get((book, ch))
            if amap is None:
                continue
            words = []
            for row in amap.get("%s %s" % (book.upper(), ref), []):
                if any(code in strong_codes(src.get("strong")) for src in row.get("sources", [])):
                    words.append(" ".join(t["word"] for t in row.get("targets", [])))
            out["%s %s" % (book, ref)] = " / ".join(words) if words else None
    return out


def helps_everywhere(s, kind, resource, keep):
    """Every prepared helps row of a resource, in every book on the device, that `keep` accepts; and the books the
    device has of it at all."""
    found, present = {}, set()
    for k, e in s.rows("prepared", resource):
        m = re.match(r"^prepared:%s:[^:]+/[^:]+/[^:]+:([^:]+):(\d+):light$" % re.escape(kind), k)
        if not m:
            continue
        present.add(m.group(1))
        content = (e or {}).get("content") or {}
        for row in content.get({"notes": "notes", "words-links": "links"}[kind], []):
            if keep(row):
                found.setdefault(m.group(1), []).append(row)
    return found, present


def aligned_words(s, helps, text):
    """{(book, chapter): {row id: gateway words}} from the align rows of a helps resource against one text."""
    found = {}
    for k, e in s.rows("align", helps):
        m = re.search(r":%s@[^:]*:([^:]+):(\d+)$" % re.escape(text), k)
        if m and isinstance(e, dict):
            found[(m.group(1), m.group(2))] = {i: joined(row) for i, row in (e.get("content") or {}).items()}
    return found


def missing_books(s, resource, present):
    r = s.resources().get(resource) or {}
    return [b for b in r.get("books", []) if b not in present]


def cmd_occurrences(s, a):
    data, lines = {}, []
    a.limit = a.limit or 10 ** 9
    only = {b.strip().lower() for b in a.books.split(",")} if a.books else None
    if a.strong:
        code = normal_code(a.strong)
        subject = "Greek New Testament" if code.startswith("G") else "Hebrew Old Testament"
        original = pick(s, a.original, [subject])
        places, lemma, how, searched = places_of_strong(s, original, code)
        orig_missing = original_books_missing(s, original, searched)
        if only:
            places = {b: r for b, r in places.items() if b in only}
        text = pick(s, a.text, ["Aligned Bible"]) if (a.text or any(r.get("subject") == "Aligned Bible" for r in s.resources().values())) else None
        rend = renderings(s, text, code, places) if text else {}
        total = sum(len(v) for v in places.values())
        data = {"code": code, "lemma": lemma, "original": original, "from": how, "verses": total, "originalBooksNotOnDevice": orig_missing,
                "books": {b: [{"ref": r, "text": rend.get("%s %s" % (b, r))} for r in refs] for b, refs in sorted(places.items(), key=lambda x: book_rank(x[0]))}}
        if text:
            data["text"] = text
            release = set(s.resources().get(text, {}).get("books", []))
            loaded = {k.split(" ")[0] for k in rend}
            data["textNotOnDevice"] = sorted((b for b in places if b in release and b not in loaded), key=book_rank)
            data["textNotInRelease"] = sorted((b for b in places if b not in release), key=book_rank)
        lines.append("%s %s: %d verses in %d books (%s, from %s)" % (code, lemma, total, len(places), original, "its index" if how == "index" else "its words"))
        for b, refs in sorted(places.items(), key=lambda x: book_rank(x[0])):
            shown = []
            for r in refs[: a.limit]:
                t = rend.get("%s %s" % (b, r))
                shown.append("%s%s" % (r, " «%s»" % t if t else ""))
            more = "" if len(refs) <= a.limit else " … and %d more" % (len(refs) - a.limit)
            lines.append("  %s: %s%s" % (b.upper(), ", ".join(shown), more))
        if orig_missing:
            lines.append("  Not searched: the original of %d books is not on this device (%s)" % (len(orig_missing), few(orig_missing)))
        if text and data.get("textNotOnDevice"):
            lines.append("  %s has these books in its release, not on this device: %s" % (text, few(data["textNotOnDevice"])))
        if text and data.get("textNotInRelease"):
            lines.append("  %s does not have these books yet: %s" % (text, few(data["textNotInRelease"])))
    elif a.academy or a.word:
        if a.academy:
            notes = pick(s, a.notes, ["TSV Translation Notes"])
            art = a.academy.strip("/").split("/")[-1]
            found, present = helps_everywhere(s, "notes", notes, lambda n: str(n.get("supportReference", "")).rstrip("/").endswith("/" + art))
            resource, label = notes, "notes citing " + art
            fmt = lambda n: "%s %s" % (n["reference"], n.get("quote") or "")
        else:
            twl = pick(s, a.links, ["TSV Translation Words Links"])
            path = a.word.strip("/").replace("rc://*/tw/dict/", "")
            found, present = helps_everywhere(s, "words-links", twl, lambda l: l.get("articlePath") == path)
            resource, label = twl, "links to " + path
            fmt = lambda l: "%s %s" % (l["reference"], l.get("origWords", ""))
        if only:
            found = {b: r for b, r in found.items() if b in only}
            present = {b for b in present if b in only}
        text = pick(s, a.text, []) if a.text else None
        words = aligned_words(s, resource, text) if text else {}
        fields = ("id", "reference", "quote", "occurrence", "supportReference", "note") if a.academy else \
                 ("id", "reference", "origWords", "occurrence", "articlePath", "twLink")
        shaped = {}
        for b, rows in found.items():
            for r in rows:
                d = {"book": b}
                d.update({k: (unescape(r.get(k)) if k == "note" else r.get(k)) for k in fields})
                if text:
                    ch = str(r.get("reference", "")).split(":")[0]
                    d["textQuote"] = words.get((b, ch), {}).get(r.get("id")) or None
                shaped.setdefault(b, []).append(d)
        found = shaped
        if text:
            fmt0 = fmt
            fmt = lambda r: fmt0(r) + (" → " + r["textQuote"] if r.get("textQuote") else "")
        total = sum(len(v) for v in found.values())
        missing = sorted((b for b in missing_books(s, resource, present) if not only or b in only), key=book_rank)
        data = {"resource": resource, "count": total, "books": {b: rows for b, rows in sorted(found.items(), key=lambda x: book_rank(x[0]))},
                "booksNotOnDevice": missing}
        lines.append("%d %s in %d books (%s)" % (total, label, len(found), resource))
        for b, rows in sorted(found.items(), key=lambda x: book_rank(x[0])):
            shown = [fmt(r) for r in rows[: a.limit]]
            more = "" if len(rows) <= a.limit else " … and %d more" % (len(rows) - a.limit)
            lines.append("  %s: %s%s" % (b.upper(), "; ".join(shown), more))
        if missing:
            lines.append("  Not searched: %d books of the release are not on this device (%s)" % (len(missing), few(missing)))
    else:
        sys.exit("Say what to find: --strong G5485, --academy figs-metaphor or --word bible/kt/grace")
    out(a, data, "\n".join(lines))


# A whole verse at once, for an assistant that helps a translator


def texts_on_device(s):
    """Every Bible text the packs name: gateway texts first (literal ones like ULT and GLT, then simplified ones like
    UST and GST, then the rest), then the originals."""
    res = s.resources()
    rank = lambda k: (0 if k.endswith("lt") else 1 if k.endswith("st") else 2, k)
    gate = sorted((k for k, r in res.items() if r.get("subject") in ("Aligned Bible", "Bible")), key=rank)
    orig = [k for k, r in res.items() if r.get("subject") in ("Greek New Testament", "Hebrew Old Testament")]
    return gate, orig


def verse_text(s, text, book, ch, v):
    chapter = light_chapter(s, text, book, ch)
    if not chapter:
        return None
    words, inside = [], False
    for block in chapter["blocks"]:
        for i in block["inline"]:
            if i["kind"] == "verse":
                inside = i["chapterNumber"] == ch and i["verseNumber"] == v
            elif inside and i["kind"] == "text":
                words.append(i["text"])
    t = re.sub(r"\s+", " ", "".join(words)).strip()
    return t or None


def original_words(s, original, book, ch, v):
    e = s.find("sot", original, "scripture-usj:%s:%s:%d" % (original, book, ch))
    if not e:
        return []
    usj = ((e.get("content") or {}).get("usj")) or {}
    return [w for verse, w in walk_words(usj.get("content"), {"verse": "0"}) if verse == str(v)]


def lexicon_brief(s, code):
    subject = "Greek Lexicon" if code.startswith("G") else "Hebrew Lexicon"
    hits = [k for k, r in s.resources().items() if r.get("subject") == subject]
    if not hits:
        return None
    m = re.match(r"^[GH]0*(\d+)", code)
    e = s.find("sot", hits[0], "%s/content/%s.json" % (hits[0], m.group(1))) if m else None
    return e.get("brief") if isinstance(e, dict) else None


def cmd_context(s, a):
    """Everything about one verse: texts, original words with lexicon and renderings, notes, questions, word links,
    and how its words and articles reach into other books."""
    book, ch, v = parse_ref(a.ref)
    gate, orig = texts_on_device(s)
    data = {"ref": a.ref, "texts": {}, "original": None, "words": [], "notes": [], "questions": [], "links": [], "elsewhere": {}}
    lines = ["# %s" % a.ref.upper()]
    for t in gate + orig:
        vt = verse_text(s, t, book, ch, v)
        if vt:
            data["texts"][t] = vt
            lines.append("%s: %s" % (s.resources()[t].get("title") or t, vt))
    original = next((o for o in orig if verse_text(s, o, book, ch, v)), None)
    data["original"] = original
    words = original_words(s, original, book, ch, v) if original else []
    maps = {}
    for t in gate:
        e = s.find("sot", t, "scripture-usj:%s:%s:%d" % (t, book, ch))
        if e:
            maps[t] = ((e.get("content") or {}).get("alignmentMap") or {}).get("%s %d:%d" % (book.upper(), ch, v), [])
    codes = []
    lines.append("\n## Words of the original")
    for w in words:
        surface = "".join(x for x in (w.get("content") or []) if isinstance(x, str))
        cs = strong_codes(w.get("strong"))
        codes += [c for c in cs if c not in codes]
        rend = {}
        for t, rows in maps.items():
            got = [" ".join(x["word"] for x in r.get("targets", [])) for r in rows
                   if any(src.get("content") == surface and src.get("strong") == w.get("strong") for src in r.get("sources", []))]
            if got:
                rend[t.split("/")[-1]] = " / ".join(got)
        brief = lexicon_brief(s, cs[0]) if cs else None
        data["words"].append({"text": surface, "lemma": w.get("lemma"), "strong": cs, "morph": w.get("x-morph"), "lexicon": brief, "renderings": rend})
        lines.append("- %s (%s, %s%s)%s%s" % (surface, w.get("lemma", ""), ",".join(cs), ", " + w["x-morph"] if w.get("x-morph") else "",
                                               ": " + brief if brief else "", "  →  " + "; ".join("%s «%s»" % kv for kv in rend.items()) if rend else ""))
    notes_res = [k for k, r in s.resources().items() if r.get("subject") == "TSV Translation Notes"]
    if notes_res:
        nr = notes_res[0]
        chapter = helps_chapter(s, "notes", nr, book, ch) or {}
        aligned = {}
        lit = gate[0] if gate else None
        if lit:
            for k, e in s.rows("align", nr):
                if ":%s@" % lit in k and k.endswith(":%s:%d" % (book, ch)) and isinstance(e, dict):
                    aligned = e.get("content") or {}
                    break
        lines.append("\n## Translation notes")
        for n in chapter.get("notes", []):
            if covers(n.get("reference"), ch, v) and not is_intro(n):
                d = {"id": n["id"], "quote": n.get("quote"), "occurrence": n.get("occurrence"), "supportReference": n.get("supportReference"),
                     "note": unescape(n.get("note")), "textQuote": joined(aligned.get(n["id"], {})) or None}
                data["notes"].append(d)
                art = (n.get("supportReference") or "").split("/")[-1]
                lines.append("- %s%s%s: %s" % (n.get("quote") or "(general)", "  →  " + d["textQuote"] if d["textQuote"] else "",
                                               "  [%s]" % art if art else "", plain(n.get("note"))))
    tq = [k for k, r in s.resources().items() if r.get("subject") == "TSV Translation Questions"]
    if tq:
        chapter = helps_chapter(s, "questions", tq[0], book, ch) or {}
        qs = [q for q in chapter.get("questions", []) if covers(q.get("reference"), ch, v)]
        data["questions"] = qs
        if qs:
            lines.append("\n## Translation questions")
            lines += ["- %s  %s" % (q["question"], q["response"]) for q in qs]
    twl = [k for k, r in s.resources().items() if r.get("subject") == "TSV Translation Words Links"]
    if twl:
        chapter = helps_chapter(s, "words-links", twl[0], book, ch) or {}
        ls = [l for l in chapter.get("links", []) if covers(l.get("reference"), ch, v)]
        data["links"] = ls
        if ls:
            lines.append("\n## Key words (Translation Words)")
            lines += ["- %s → %s" % (l["origWords"], l["articlePath"]) for l in ls]
    if not a.no_elsewhere and original and codes:
        places, lemmas, how, searched = places_of_codes(s, original, codes)
        missing = original_books_missing(s, original, searched)
        lines.append("\n## Elsewhere in the Bible (each word of the original)")
        for c in codes:
            pl = places.get(c, {})
            n = sum(len(r) for r in pl.values())
            others = {b: r for b, r in pl.items() if b != book}
            data["elsewhere"][c] = {"lemma": lemmas.get(c), "verses": n, "books": {b: r for b, r in sorted(pl.items(), key=lambda x: book_rank(x[0]))}}
            if n:
                here = pl.get(book, [])
                common = n > 300
                lines.append("- %s %s: %d verses in %d books%s" % (c, lemmas.get(c, ""), n, len(pl),
                                                                  " (a very common word)" if common else
                                                                  "; in this book " + ", ".join(here) if here else ""))
        if missing:
            data["originalBooksNotOnDevice"] = missing
            lines.append("  (the original of %d books is not on this device, so they were not counted: %s)" % (len(missing), few(missing)))
    out(a, data, "\n".join(lines))


def cmd_intro(s, a):
    """The book's introduction, or a chapter's, from the translation notes."""
    m = re.match(r"^\s*([1-3]?[A-Za-z]{2,3})(?:\s+(\d+))?\s*$", a.book)
    if not m:
        sys.exit('Give a book code, or a book and a chapter: "TIT", "TIT 2"')
    book, ch = m.group(1).lower(), int(m.group(2) or 1)
    notes = pick(s, a.notes, ["TSV Translation Notes"])
    chapter = helps_chapter(s, "notes", notes, book, ch) or {}
    intros = [n for n in chapter.get("notes", []) if is_intro(n)]
    want = intros[:1] if not m.group(2) else intros[1:] or intros
    if not want:
        sys.exit("No introduction for %s in %s" % (a.book, notes))
    out(a, [dict(n, note=unescape(n.get("note"))) for n in want], "\n\n".join(unescape(n.get("note")) for n in want))


def main():
    p = argparse.ArgumentParser(description="Read Bible translation language packs offline.")
    sub = p.add_subparsers(dest="cmd", required=True)

    def add(name, fn, **extra):
        c = sub.add_parser(name)
        c.add_argument("sources", nargs="+", help=".langpack.zip, .part.gz, or a folder of them")
        c.add_argument("--json", action="store_true")
        c.add_argument("--out", help="write the result to this file, in UTF-8, instead of the console")
        for flag, kw in extra.items():
            c.add_argument("--" + flag.replace("_", "-"), **kw)
        c.set_defaults(fn=fn)

    add("info", cmd_info)
    add("keys", cmd_keys, layer={"choices": LAYERS}, resource={}, prefix={}, limit={"type": int, "default": 50})
    add("row", cmd_row, key={"required": True})
    add("verse", cmd_verse, text={}, ref={"required": True})
    add("align", cmd_align, text={}, ref={"required": True})
    add("notes", cmd_notes, notes={}, text={}, ref={"required": True}, intro={"action": "store_true", "help": "include book and chapter introductions"})
    add("questions", cmd_questions, questions={}, ref={"required": True})
    add("links", cmd_links, links={}, ref={"required": True})
    add("article", cmd_article, path={"required": True}, resource={})
    add("lexicon", cmd_lexicon, strong={"required": True}, resource={})
    add("context", cmd_context, ref={"required": True}, no_elsewhere={"action": "store_true", "help": "skip the search in other books"})
    add("intro", cmd_intro, book={"required": True, "help": '"TIT" for the book, "TIT 2" for chapter 2'}, notes={})
    add("occurrences", cmd_occurrences, strong={}, academy={}, word={}, original={}, text={}, notes={}, links={},
        books={"help": "only these books, e.g. tit,rut"}, limit={"type": int, "default": 12, "help": "places shown per book in text; 0 shows all (--json always has all)"})
    a = p.parse_args()
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    a.fn(Sources(a.sources), a)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Generate the "imported" layer of the course for book chapters (Vol I-IV).

For every chapter it writes content/<id>/chapter.json, 00-overview.json, one lesson per
major section (NN-<slug>.json) and 99-test.json, built from the structured teaching data
the textbook repo already keeps next to each chapter:

  *_quizzes.json   per-section MCQ / TF / FILL / ORDER / SHORT questions with explanations
  *_concepts.yml   primary concepts, one-sentence claims, formulas, technical terms

Questions are imported verbatim (attribution in the course README). Prose is never copied
beyond one short orientation excerpt per section (<= 90 words). A chapter that already has
hand-written ("deep") lessons is skipped unless --force: see DEEP_MARKER.

Usage: generate_chapter.py COURSE_DIR [CHAPTER_ID ...] [--force]
"""
import argparse
import glob
import json
import os
import random
import re
import sys

import yaml

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SKILL = os.path.expanduser("~/.claude/skills/book-to-course/scripts")
sys.path.insert(0, SKILL)
import build_course as bc  # noqa: E402

DEEP_MARKER = ".deep"  # file inside content/<id>/ marking hand-written chapters
VOL_NAME = {"1": "Vol I", "2": "Vol II", "3": "Vol III", "4": "Vol IV"}
SKIP_SECTIONS = ("purpose",)


# ---------------------------------------------------------------- text helpers
def slug(s, n=32):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:n].strip("-") or "section"


def clean_prose(p):
    p = re.sub(r"`\{python\}\s*([^`]+)`", "…", p)
    p = re.sub(r"\[\^[^\]]+\]", "", p)
    p = re.sub(r"\s*\[@[^\]]+\]", "", p)
    p = re.sub(r"\\index\{[^}]*\}", "", p)
    p = re.sub(r"@(sec|fig|tbl|eq|lst)-[\w-]+", "a later section", p)
    p = re.sub(r"\{\.[^}]*\}", "", p)
    p = re.sub(r"\s+", " ", p).strip()
    return p


def excerpt(body, limit=90):
    """First real prose paragraph of a section, cut at a sentence boundary under `limit` words."""
    body = re.sub(r"```.*?```", "", body, flags=re.S)
    body = re.sub(r"^:::.*$", "", body, flags=re.M)
    for para in re.split(r"\n\s*\n", body):
        para = para.strip()
        if not para or para[0] in "#!|<[-*>\\$" or para.startswith(("```", ":::", "+")):
            continue
        txt = clean_prose(para)
        if len(txt.split()) < 25:
            continue
        out, n = [], 0
        for sent in re.split(r"(?<=[.!?])\s+", txt):
            w = len(sent.split())
            if n + w > limit and out:
                break
            out.append(sent)
            n += w
        res = " ".join(out)
        if len(res.split()) > limit:
            res = " ".join(res.split()[:limit]) + " …"
        return res
    return ""


def split_sections(qmd):
    """[(title, sec_id, body)] for level-2 headings of the raw .qmd."""
    qmd = re.sub(r"```\{python\}.*?```", "", qmd, flags=re.S)
    parts = re.split(r"^## (.+)$", qmd, flags=re.M)
    out = []
    for i in range(1, len(parts), 2):
        head, body = parts[i], parts[i + 1]
        m = re.search(r"\{#(sec-[^\s}]+)", head)
        title = re.sub(r"\s*\{[^}]*\}\s*$", "", head).strip()
        out.append((title, "#" + m.group(1) if m else "", body))
    return out


def h3s(body):
    return [re.sub(r"\s*\{[^}]*\}\s*$", "", h).strip() for h in re.findall(r"^### (.+)$", body, flags=re.M)]


# ---------------------------------------------------------------- math safety
class Lint(bc.Report):
    pass


def _lint_ok(s, cmds):
    r = Lint()
    r.math_cmds = cmds
    bc.lint_latex(r, s, "x")
    return not r.errors


def safe_md(s, cmds):
    """Keep the book's LaTeX when the player can render it; otherwise fall back to plain text."""
    if s is None:
        return s
    s = s.replace("\t", "\\t").replace("\x08", "\\b").replace("\x0c", "\\f")
    s = s.replace("\\$", "\x00")
    s = re.sub(r"(?<![\\$])\$(?=\d)", r"\\$", s)  # currency like $5 -> \$5
    s = s.replace("\x00", "\\$")
    if _lint_ok(s, cmds):
        return s
    plain = re.sub(r"(?<!\\)\$+", "", s)
    plain = re.sub(r"\\(times|cdot)", "×", plain)
    plain = re.sub(r"\\(text|mathrm|mathbf|operatorname)\{([^}]*)\}", r"\2", plain)
    plain = re.sub(r"\\([A-Za-z]+)", r"\1", plain).replace("{", "").replace("}", "")
    return plain


# ---------------------------------------------------------------- question conversion
LETTER = re.compile(r"correct answer is\s*\(?([A-F])\b", re.I)


def first_sentence(s):
    m = re.match(r"(.+?[.!?])(\s|$)", s.strip(), re.S)
    return (m.group(1) if m else s).strip()


def convert(q, cmds):
    t = q.get("question_type")
    text = q.get("question", "").strip()
    ans = (q.get("answer") or "").strip()
    obj = q.get("learning_objective", "")
    hint = ("Think about: " + obj[0].lower() + obj[1:]) if obj else None
    base = {"q": safe_md(text, cmds), "explanation": safe_md(ans, cmds)}
    if hint:
        base["hint"] = safe_md(hint, cmds)
    if t == "MCQ":
        m = LETTER.search(ans)
        ch = q.get("choices") or []
        if not m or not (2 <= len(ch) <= 6):
            return None
        idx = ord(m.group(1).upper()) - 65
        if idx >= len(ch):
            return None
        base.update(type="single", options=[safe_md(c, cmds) for c in ch], answer=idx)
        return base
    if t == "TF":
        a = ans.lower()
        if a.startswith("true"):
            v = True
        elif a.startswith("false"):
            v = False
        else:
            return None
        base.update(type="truefalse", answer=v)
        base["q"] = safe_md(re.sub(r"^True or False:\s*", "", text), cmds)
        return base
    if t == "FILL":
        word = first_sentence(ans).rstrip(".!?").strip().strip("*`\"'")
        if not word or len(word.split()) > 6:
            return None
        variants = {word}
        variants.add(word.replace("-", " "))
        variants.add(re.sub(r"\s*\([^)]*\)", "", word).strip())
        base.update(type="fill", answer=sorted(v for v in variants if v))
        return base
    if t == "ORDER":
        items = re.findall(r"\((\d)\)\s*([^\n(]+?)(?=\s*\(\d\)|\n|$)", text)
        stem = re.split(r"\n?\s*\(1\)", text)[0].strip()
        if len(items) < 2:
            return None
        lookup = {n: s.strip().rstrip(",;") for n, s in items}
        seq = re.findall(r"\((\d)\)", ans.split("\n")[0])
        seen = []
        for n in seq:
            if n in lookup and n not in seen:
                seen.append(n)
        if sorted(seen) != sorted(lookup):
            return None
        base.update(type="order", q=safe_md(stem, cmds), items=[safe_md(lookup[n], cmds) for n in seen])
        return base
    return None  # SHORT handled as reveal


# ---------------------------------------------------------------- lesson builders
def learning_goals(qs):
    out = []
    for q in qs:
        o = (q.get("learning_objective") or "").strip().rstrip(".")
        if o and o not in out:
            out.append(o)
    return out[:5]


STOP = set("the a an of and or to in on for with by from is are as at be this that it its into how why what when".split())


def words_of(s):
    return [w for w in re.findall(r"[a-z][a-z-]+", s.lower()) if w not in STOP and len(w) > 2]


def match_concept(title, body, claims):
    """Concept whose name (and claim) best matches this section's title and text."""
    tb = " ".join(words_of(title)) * 3 + " " + " ".join(words_of(body))
    best, score = None, 0.0
    for c, cl in claims.items():
        cw = set(words_of(c))
        if not cw:
            continue
        sc = sum(tb.count(w) for w in cw) / len(cw) + 0.05 * sum(1 for w in set(words_of(cl)) if w in tb)
        if sc > score:
            best, score = c, sc
    return best


def synth_questions(cid, n, title, body, concepts, cmds):
    """Practice for chapters without a quiz file: claim matching + relationship true/false."""
    cm = (concepts or {}).get("concept_map") or {}
    claims = cm.get("claims") or {}
    if len(claims) < 4:
        return [], None
    c = match_concept(title, body, claims)
    if not c:
        return [], None
    rnd = random.Random("%s-%d" % (cid, n))
    others = rnd.sample([o for o in claims if o != c], 3)
    opts = [claims[c]] + [claims[o] for o in others]
    order = list(range(4))
    rnd.shuffle(order)
    qs = [{"type": "single", "q": safe_md("The section **%s** develops one of the chapter's claims. Which one?" % title, cmds),
           "options": [safe_md(opts[i], cmds) for i in order], "answer": order.index(0),
           "hint": "Re-read the excerpt and the section map: which idea is this section building toward?",
           "explanation": safe_md("This section develops **%s**: %s" % (c, claims[c]), cmds)}]
    rels = ((cm.get("explorer_graph") or {}).get("relationships")) or []
    mine = [r for r in rels if r.get("source") == c and isinstance(r.get("target"), dict)]
    if mine:
        r = mine[0]
        tgt = r["target"].get("concept")
        alts = [x["target"].get("concept") for x in rels if isinstance(x.get("target"), dict) and x["target"].get("concept") not in (tgt, None)]
        if alts and rnd.random() < 0.5:
            wrong = rnd.choice(alts)
            qs.append({"type": "truefalse", "q": safe_md("True or false: in the book's concept map, *%s* %s *%s*." % (c, r["predicate"], wrong), cmds),
                       "answer": False, "hint": "Which later concept does this idea actually connect to?",
                       "explanation": safe_md("False. The book links *%s* %s *%s*." % (c, r["predicate"], tgt), cmds)})
        else:
            qs.append({"type": "truefalse", "q": safe_md("True or false: in the book's concept map, *%s* %s *%s*." % (c, r["predicate"], tgt), cmds),
                       "answer": True, "hint": "Think about which later idea this concept feeds.",
                       "explanation": safe_md("True. %s" % (r.get("explanation") or ""), cmds)})
    return qs, c


def section_terms(concepts, ids, seen):
    """Glossary terms for one lesson: the book's learner-graph concepts whose section is in this lesson."""
    lg = ((concepts or {}).get("concept_map") or {}).get("learner_graph") or {}
    out = []
    for c in lg.get("concepts") or []:
        label, summary, sec = c.get("label"), c.get("summary"), c.get("section")
        if not (label and summary and sec in ids) or label.lower() in seen:
            continue
        seen.add(label.lower())
        out.append({"term": label, "def": summary})
    return out[:8]


def section_lesson(cid, vol_label, ch_title, n, title, body, quiz, cmds, concepts=None):
    les_id = "%s-%02d" % (cid, n)
    qs = (quiz or {}).get("questions") or []
    goals = learning_goals(qs)
    blocks = []
    intro = "This lesson follows **%s** in *%s* (%s)." % (title, ch_title, vol_label)
    if goals:
        intro += " By the end you should be able to:\n\n" + "\n".join("- " + g for g in goals)
    blocks.append({"type": "text", "md": safe_md(intro, cmds)})
    ex = excerpt(body)
    if ex:
        blocks.append({"type": "from_book", "source": "%s, %s, \u00a7 %s" % (vol_label, ch_title, title), "md": safe_md(ex, cmds)})
    subs = h3s(body)
    focus = ((quiz or {}).get("rationale") or {}).get("focus_areas") or []
    if subs or focus:
        md = ""
        if subs:
            md += "The section is organised as:\n\n" + "\n".join("- " + s for s in subs[:8])
        if focus:
            md += ("\n\n" if md else "") + "Pay attention to: " + "; ".join(focus[:4]) + "."
        blocks.append({"type": "callout", "kind": "note", "title": "Map of the section", "md": safe_md(md, cmds)})
    conv = [c for c in (convert(q, cmds) for q in qs if q.get("question_type") != "SHORT") if c]
    shorts = [q for q in qs if q.get("question_type") == "SHORT"]
    if not qs:
        conv, concept = synth_questions(cid, n, title, body, concepts, cmds)
        if concept:
            claim = (((concepts or {}).get("concept_map") or {}).get("claims") or {}).get(concept, "")
            shorts = [{"question": "In two or three sentences, explain why %s matters for the system this section describes." % concept,
                       "answer": "Compare your answer with the book's claim: " + claim}]
    for q in shorts[:1]:
        blocks.append({"type": "reveal", "prompt": safe_md("Think first: " + q["question"], cmds), "md": safe_md(q["answer"], cmds)})
    if conv:
        blocks.append({"type": "quiz", "id": les_id + "-quiz", "title": "Check your understanding", "questions": conv[:6]})
    for q in shorts[1:3]:
        blocks.append({"type": "reveal", "prompt": safe_md("Explain it: " + q["question"], cmds), "md": safe_md(q["answer"], cmds)})
    pts = ["You can now %s." % (g[0].lower() + g[1:]) for g in goals[:4]] or ["You have worked through %s." % title]
    blocks.append({"type": "summary", "points": [safe_md(p, cmds) for p in pts]})
    return les_id, {"title": title, "summary": safe_md(("Work through " + title + ".") if not goals else goals[0] + ".", cmds),
                    "source": {"chapter": cid, "sections": [title] + subs[:8]}, "blocks": blocks, "_conv": conv, "_short": shorts}


def overview_lesson(cid, vol_label, ch_title, concepts, purpose_body, sections, cmds):
    cm = (concepts or {}).get("concept_map") or {}
    claims = cm.get("claims") or {}
    prim = [c for c in (cm.get("primary_concepts") or []) if c in claims]
    sec = [c for c in (cm.get("secondary_concepts") or []) if c in claims]
    blocks = [{"type": "text", "md": "Welcome to **%s** (%s). This overview gives you the chapter's big ideas before the "
               "section-by-section lessons. Read the claims once, flip the flashcards, then take the warm-up quiz: "
               "it is fine to miss questions here, the lessons that follow fill the gaps." % (ch_title, vol_label)}]
    ex = excerpt(purpose_body or "", 80)
    if ex:
        blocks.append({"type": "from_book", "source": "%s, %s, Purpose" % (vol_label, ch_title), "md": safe_md(ex, cmds)})
    if sections:
        blocks.append({"type": "flow", "title": "The path through this chapter",
                       "nodes": [{"label": s[:40], "detail": "Lesson %d covers this section." % (i + 1)} for i, s in enumerate(sections[:7])]})
    keyc = prim + sec
    if keyc:
        blocks.append({"type": "table", "headers": ["Concept", "The claim to remember"],
                       "rows": [["**%s**" % c, safe_md(claims[c], cmds)] for c in keyc]})
    forms = [f for f in (cm.get("formulas") or []) if "\\" in f]
    good = [f for f in forms if _lint_ok("$$" + f + "$$", cmds)][:4]
    if good:
        blocks.append({"type": "callout", "kind": "key", "title": "Formulas you will meet",
                       "md": "\n\n".join("$$" + f + "$$" for f in good)})
    if len(keyc) >= 4:
        blocks.append({"type": "flashcards", "id": cid + "-cards-concepts", "title": "Key concepts",
                       "cards": [{"front": c, "back": safe_md(claims[c], cmds)} for c in keyc[:10]]})
    terms = cm.get("technical_terms") or []
    # warm-up: which claim belongs to which concept (distractors = other claims of the same chapter)
    rnd = random.Random(cid)
    qs = []
    for c in keyc[:5]:
        others = [o for o in keyc if o != c]
        if len(others) < 3:
            break
        opts = [claims[c]] + [claims[o] for o in rnd.sample(others, 3)]
        order = list(range(4))
        rnd.shuffle(order)
        qs.append({"type": "single", "q": "Which statement captures **%s**?" % c,
                   "options": [safe_md(opts[i], cmds) for i in order], "answer": order.index(0),
                   "hint": "Look for the statement whose subject is %s itself, not a neighbouring idea." % c,
                   "explanation": safe_md("**%s:** %s" % (c, claims[c]), cmds)})
    if qs:
        blocks.append({"type": "quiz", "id": cid + "-quiz-warmup", "title": "Warm-up: match the big ideas", "questions": qs})
    pts = ["%s: %s" % (c, first_sentence(claims[c])) for c in prim[:4]] or ["You have seen the map of %s." % ch_title]
    blocks.append({"type": "summary", "points": [safe_md(p, cmds) for p in pts]})
    les = {"title": "Overview: the big ideas", "summary": "The chapter's key concepts and how its sections fit together.",
           "source": {"chapter": cid, "sections": ["Purpose", "concept map"]}, "blocks": blocks,
           "terms": [{"term": t, "def": "Technical term introduced in %s." % ch_title} for t in terms[:0]]}
    return les, qs


def test_lesson(cid, ch_title, pool, cmds):
    rnd = random.Random(cid + "-test")
    by_type = {}
    for q in pool:
        by_type.setdefault(q["type"], []).append(q)
    picked = []
    for t in ("single", "truefalse", "order", "fill"):
        lst = by_type.get(t, [])
        rnd.shuffle(lst)
        picked += lst[: {"single": 6, "truefalse": 2, "order": 2, "fill": 2}[t]]
    if len(picked) < 8:
        rest = [q for q in pool if q not in picked]
        rnd.shuffle(rest)
        picked += rest[: 10 - len(picked)]
    rnd.shuffle(picked)
    if not picked:
        return None
    return {"title": "Test: " + ch_title, "kind": "test", "summary": "Check what you learned across the whole chapter.",
            "blocks": [{"type": "quiz", "id": cid + "-test", "pass_score": 0.7, "questions": picked[:12]}]}


# ---------------------------------------------------------------- main
def chapter_sources(cid):
    vol, num = cid[1], cid[3:]
    d = glob.glob(os.path.join(ROOT, "books", "vol" + vol, num + "_*"))[0]
    qmd = glob.glob(os.path.join(d, num + "_*.qmd"))[0]
    quiz = glob.glob(os.path.join(d, "*_quizzes.json"))
    conc = glob.glob(os.path.join(d, "*_concepts.yml"))
    return qmd, (quiz[0] if quiz else None), (conc[0] if conc else None)


def write(path, obj):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)


def generate(course, cid, title, order, force=False):
    out = os.path.join(course, "content", cid)
    if os.path.exists(os.path.join(out, DEEP_MARKER)) and not force:
        return "deep (kept)"
    cmds = bc.load_math_cmds(course)
    qmd_path, quiz_path, conc_path = chapter_sources(cid)
    qmd = open(qmd_path, encoding="utf-8").read()
    quizzes = {}
    if quiz_path:
        for s in json.load(open(quiz_path, encoding="utf-8")).get("sections", []):
            if (s.get("quiz_data") or {}).get("quiz_needed"):
                quizzes[s["section_id"]] = s["quiz_data"]
    concepts = yaml.safe_load(open(conc_path, encoding="utf-8")) if conc_path else {}
    vol_label = VOL_NAME[cid[1]]
    ch_title = title.split("\u00b7", 1)[-1].strip()
    secs = split_sections(qmd)
    purpose = next((b for t, _, b in secs if t.lower().startswith("purpose")), "")
    body_secs = [s for s in secs if not s[0].lower().startswith(SKIP_SECTIONS)]
    # merge short sections without quizzes into the previous lesson
    lessons_src = []
    for t, sid, b in body_secs:
        if lessons_src and ((sid not in quizzes and len(b.split()) < 700) or t.lower().startswith("summary")):
            pt, psid, pb, extra = lessons_src[-1]
            lessons_src[-1] = (pt, psid, pb, extra + [(t, b, sid)])
        else:
            lessons_src.append((t, sid, b, []))
    if os.path.isdir(out):
        for f in glob.glob(os.path.join(out, "*.json")):
            if "b-lab-" not in os.path.basename(f):  # hand-written labs (labs.py) survive a regeneration
                os.remove(f)
    os.makedirs(out, exist_ok=True)
    concepts_map = (concepts or {}).get("concept_map") or {}
    chapter = {"title": title, "order": order,
               "summary": "%s: %s" % (vol_label, ", ".join((concepts_map.get("primary_concepts") or [])[:3]) or ch_title),
               "goals": [g for g in (concepts_map.get("primary_concepts") or [])[:6]],
               "layer": "imported"}
    write(os.path.join(out, "chapter.json"), chapter)
    ov, warm = overview_lesson(cid, vol_label, ch_title, concepts, purpose, [l[0] for l in lessons_src], cmds)
    seen_terms = set()
    claims = concepts_map.get("claims") or {}
    ov_terms = [{"term": c, "def": claims[c]} for c in (concepts_map.get("primary_concepts") or []) + (concepts_map.get("secondary_concepts") or []) if claims.get(c)]
    if ov_terms:
        ov["terms"] = ov_terms
        seen_terms |= {t["term"].lower() for t in ov_terms}
    write(os.path.join(out, "00-overview.json"), ov)
    pool = list(warm)
    n = 0
    for t, sid, b, extra in lessons_src:
        n += 1
        les_id, les = section_lesson(cid, vol_label, ch_title, n, t, b + "".join("\n### %s\n" % et for et, *_ in extra), quizzes.get(sid), cmds, concepts)
        pool += les.pop("_conv")
        les.pop("_short")
        if extra:
            les["source"]["sections"] += [et for et, *_ in extra]
        ids = {sid.lstrip("#")} | {x for _, eb, es in extra for x in [es.lstrip("#")]}
        for text in [b] + [eb for _, eb, _ in extra]:
            ids |= set(re.findall(r"\{#(sec-[^\s}]+)", text))
        terms = section_terms(concepts, ids, seen_terms)
        if terms:
            les["terms"] = terms
        write(os.path.join(out, "%02d-%s.json" % (n, slug(t))), les)
    tl = test_lesson(cid, ch_title, pool, cmds)
    if tl:
        write(os.path.join(out, "99-test.json"), tl)
    return "%d lessons, %d questions pooled" % (n + 1, len(pool))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("course")
    ap.add_argument("chapters", nargs="*")
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    state = json.load(open(os.path.join(a.course, ".build", "state.json"), encoding="utf-8"))
    for i, c in enumerate(state["chapters"]):
        if not c["id"].startswith("v"):
            continue
        if a.chapters and c["id"] not in a.chapters:
            continue
        print("%-6s %s" % (c["id"], generate(a.course, c["id"], c["title"], i + 1, a.force)))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Build the MLSys course: book-to-course's validator plus this course's extra blocks, then split the
bundle so the browser loads one chapter at a time.

  python3 mlsys-course-tools/build.py mlsys-course [--force]

Extra block types (rendered by assets/app.js, assets/widgets.js):
  playground  {"type":"playground","id","title","md","code"*, "check", "solution", "hint"}  runnable Python
  widget      {"type":"widget","id","widget"*, "title","md","params", "challenge":{"md","key","answer","tolerance"}}

Output:
  course/data.js          window.COURSE: meta, ui, glossary, chapters (with layer, part, lesson stubs)
  course/ch/<chapter>.js  window.__courseChapter("<chapter>", {lesson-id: lesson, ...})
"""
import glob
import json
import os
import sys

SKILL = os.path.expanduser("~/.claude/skills/book-to-course/scripts")
sys.path.insert(0, SKILL)
import build_course as bc  # noqa: E402

WIDGETS = {"iron-law", "roofline", "memory", "quantize", "amdahl", "batching", "allreduce", "kvcache", "energy", "degradation"}
bc.BLOCK_REQ["playground"] = ["code"]
bc.BLOCK_REQ["widget"] = ["widget"]

_check_block = bc.check_block


def check_block(b, where, lesson, ids, rep, counters):
    t = b.get("type") if isinstance(b, dict) else None
    if t in ("playground", "widget"):
        if t == "widget" and b.get("widget") not in WIDGETS:
            rep.err(where, "unknown widget '%s' (have: %s)" % (b.get("widget"), ", ".join(sorted(WIDGETS))))
        counters[t] = counters.get(t, 0) + 1
        b.setdefault("id", "%s-%s%d" % (lesson["id"], t, counters[t]))
        if b["id"] in ids:
            rep.err(where, "duplicate block id '%s'" % b["id"])
        ids.add(b["id"])
        bc.check_text({k: v for k, v in b.items() if k not in ("code", "check", "solution")}, where, rep)
        return
    return _check_block(b, where, lesson, ids, rep, counters)


bc.check_block = check_block
_minutes = bc.lesson_minutes


def lesson_minutes(les):
    th, pr = _minutes(les)
    for b in les["blocks"]:
        if b.get("type") == "playground":
            pr += 6
        elif b.get("type") == "widget":
            pr += 4 if b.get("challenge") else 2
    return th, pr


bc.lesson_minutes = lesson_minutes

PARTS = [
    ("v1", "Vol I", "Introduction to ML Systems"), ("tt", "TinyTorch", "Build it yourself"),
    ("v2", "Vol II", "Scaling ML Systems"), ("v3", "Vol III", "Agentic ML Systems"), ("v4", "Vol IV", "Physical AI"),
]


def stub(les):
    blocks = les.get("blocks", [])
    s = {"id": les["id"], "title": les["title"], "kind": les.get("kind", "lesson"), "minutes": les.get("minutes", 10),
         "summary": les.get("summary", ""), "quizzes": [], "exercises": [], "playgrounds": [], "widgets": []}
    for b in blocks:
        t = b.get("type")
        if t == "quiz":
            s["quizzes"].append({"id": b["id"], "n": len(b["questions"]), "test": les.get("kind") == "test" or b.get("mode") == "test"})
        elif t == "exercise":
            s["exercises"].append(b["id"])
        elif t == "playground":
            s["playgrounds"].append(b["id"])
        elif t == "widget" and b.get("challenge"):
            s["widgets"].append(b["id"])
    return s


def main():
    argv = sys.argv[1:]
    course = os.path.abspath(argv[0])
    sys.argv = [sys.argv[0]] + argv
    try:
        bc.main()
    except SystemExit as e:
        if e.code:
            raise
    path = os.path.join(course, "course", "data.js")
    raw = open(path, encoding="utf-8").read()
    data = json.loads(raw[raw.index("=") + 1:].rstrip().rstrip(";"))
    lessons = data.pop("lessons")
    os.makedirs(os.path.join(course, "course", "ch"), exist_ok=True)
    for f in glob.glob(os.path.join(course, "course", "ch", "*.js")):
        os.remove(f)
    for ch in data["chapters"]:
        cm = json.load(open(os.path.join(course, "content", ch["id"], "chapter.json"), encoding="utf-8"))
        cdir = os.path.join(course, "content", ch["id"])
        ch["layer"] = ("deep" if os.path.exists(os.path.join(cdir, ".deep"))
                       else "lab" if glob.glob(os.path.join(cdir, "*b-lab-*.json")) else cm.get("layer", "imported"))
        ch["part"] = ch["id"].split("-")[0]
        ch["stubs"] = [stub(lessons[i]) for i in ch["lessons"]]
        body = {i: lessons[i] for i in ch["lessons"]}
        js = "window.__courseChapter(%s, %s);\n" % (json.dumps(ch["id"]), json.dumps(body, ensure_ascii=False).replace("</", "<\\/").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029"))
        with open(os.path.join(course, "course", "ch", ch["id"] + ".js"), "w", encoding="utf-8") as fh:
            fh.write(js)
    data["parts"] = [{"id": p, "label": l, "title": t} for p, l, t in PARTS]
    js = "window.COURSE = " + json.dumps(data, ensure_ascii=False).replace("</", "<\\/") + ";\n"
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(js)
    print("Split: course/data.js %d KB + %d chapter files" % (len(js) // 1024, len(data["chapters"])))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Generate the TinyTorch chapters (tt-01 … tt-20): lessons from the module's markdown cells and
one unit-tested coding exercise per module.

Exercise layout (exercises/tt-NN-<name>/):
  <name>.py          the learner's file: the module with every core solution region replaced by a stub
  test_module.py     unittest wrapper: loads <name>.py as tinytorch.<pkg>.<name> and runs each test_unit_*
  _deps/tinytorch/   reference implementation of every module (the package the learner's file imports)
  _solution/<name>.py

Core regions (### BEGIN SOLUTION / role="core") become `raise NotImplementedError`; role="scaffold"
regions stay as given code, following tinytorch/NBGRADER_RELEASE_TIERS.md.
TinyTorch is MIT licensed, so its explanations are reused directly.

Usage: gen_tinytorch.py COURSE_DIR [tt-01 …] [--force]
"""
import argparse
import glob
import json
import os
import re
import shutil
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SRC = os.path.join(ROOT, "tinytorch", "src")
DEEP_MARKER = ".deep"

SOL_RE = re.compile(r"^([ \t]*)### BEGIN SOLUTION([^\n]*)\n(.*?)^[ \t]*### END SOLUTION[^\n]*\n", re.S | re.M)


def module_info(path):
    s = open(path, encoding="utf-8").read()
    exp = re.search(r"#\| default_exp (\S+)", s).group(1)
    return s, exp


def starter_of(src):
    n = [0]

    def rep(m):
        indent, attrs, body = m.group(1), m.group(2), m.group(3)
        if 'role="scaffold"' in attrs:
            return body
        n[0] += 1
        return "%s# TODO(%d): implement this part (see the docstring above and the lesson).\n%sraise NotImplementedError(\"TODO %d: not implemented yet\")\n" % (indent, n[0], indent, n[0])

    out = SOL_RE.sub(rep, src)
    return out, n[0]


def solution_of(src):
    return SOL_RE.sub(lambda m: m.group(3), src)


def tests_of(src):
    return re.findall(r"^def (test_unit_\w+)\(", src, flags=re.M)


TEST_TEMPLATE = '''"""Runs the module's own unit tests against YOUR implementation in {fname}.

Each test_unit_* function from the module becomes one unittest case, so you can watch
them turn green one by one. Run:  python3 -m unittest -v test_module
"""
import importlib.util
import io
import os
import sys
import unittest
from contextlib import redirect_stdout

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "_deps"))
os.environ.setdefault("MPLBACKEND", "Agg")

MODULE_NAME = "{modname}"
TESTS = {tests!r}


def load_learner_module():
    spec = importlib.util.spec_from_file_location(MODULE_NAME, os.path.join(HERE, "{fname}"))
    mod = importlib.util.module_from_spec(spec)
    sys.modules[MODULE_NAME] = mod
    spec.loader.exec_module(mod)
    return mod


try:
    with redirect_stdout(io.StringIO()):
        MOD = load_learner_module()
    LOAD_ERROR = None
except Exception as e:  # a syntax error should read as a failed test, not a crash
    MOD, LOAD_ERROR = None, e


class ModuleTests(unittest.TestCase):
    pass


def make(name):
    def case(self):
        if LOAD_ERROR is not None:
            self.fail("{fname} could not be imported: %r" % (LOAD_ERROR,))
        buf = io.StringIO()
        try:
            with redirect_stdout(buf):
                getattr(MOD, name)()
        except NotImplementedError as e:
            self.fail("%s: a part you still need to write was called (%s)" % (name, e))
        except AssertionError as e:
            self.fail("%s: %s\\n%s" % (name, e, buf.getvalue()[-1500:]))
    case.__name__ = name
    return case


for _n in TESTS:
    setattr(ModuleTests, _n, make(_n))

if __name__ == "__main__":
    unittest.main(verbosity=2)
'''


# ---------------------------------------------------------------- lessons from markdown cells
def cells(src):
    parts = re.split(r"^# %%(.*)$", src, flags=re.M)
    out = []
    for i in range(1, len(parts), 2):
        hdr, body = parts[i], parts[i + 1].strip()
        if "[markdown]" in hdr:
            m = re.match(r'^r?"""(.*)"""\s*$', body, re.S)
            out.append(("md", (m.group(1) if m else re.sub(r"^# ?", "", body, flags=re.M)).strip()))
        else:
            out.append(("code", body))
    return out


def wc(s):
    return len(re.findall(r"\w+", s))


def md_chunks(md, limit=170):
    """Split markdown into text blocks under the builder's word limit, keeping code fences whole."""
    paras = re.split(r"\n\s*\n(?=(?:[^`]*```[^`]*```)*[^`]*$)", md)
    chunks, cur = [], []
    for p in paras:
        if cur and wc("\n\n".join(cur + [p])) > limit:
            chunks.append("\n\n".join(cur))
            cur = []
        cur.append(p)
    if cur:
        chunks.append("\n\n".join(cur))
    return [c for c in chunks if c.strip()]


def clean_md(md):
    md = re.sub(r"\|[^\n]*\|\n", lambda m: m.group(0) if False else "", md)  # tables: drop (table block later)
    md = re.sub(r"<[^>]+>", "", md)
    md = md.replace("$", "\\$")
    return md.strip()


def table_blocks(md):
    """Pull Markdown tables out of a cell into table blocks."""
    out, rest = [], []
    lines = md.split("\n")
    i = 0
    while i < len(lines):
        if lines[i].strip().startswith("|") and i + 1 < len(lines) and re.match(r"^\s*\|[\s:|-]+\|\s*$", lines[i + 1]):
            hdr = [c.strip() for c in lines[i].strip().strip("|").split("|")]
            rows = []
            i += 2
            while i < len(lines) and lines[i].strip().startswith("|"):
                r = [c.strip().replace("$", "\\$") for c in lines[i].strip().strip("|").split("|")]
                rows.append((r + [""] * len(hdr))[: len(hdr)])
                i += 1
            out.append({"type": "table", "headers": [h.replace("$", "\\$") for h in hdr], "rows": rows})
            rest.append("\x00TABLE%d\x00" % (len(out) - 1))
        else:
            rest.append(lines[i])
            i += 1
    return "\n".join(rest), out


def lessons_from(src, cid, name):
    cs = cells(src)
    groups, cur = [], None
    for kind, body in cs:
        if kind == "md":
            m = re.match(r"^#{1,2} (.+)$", body, re.M)
            if m and (cur is None or wc(" ".join(b for _, b in cur["items"])) > 500):
                cur = {"title": re.sub(r"[#*`\U0001F000-\U0001FAFF\u2600-\u27BF\uFE0F\u200D]", "", m.group(1)).strip(), "items": []}
                groups.append(cur)
        if cur is None:
            cur = {"title": "Introduction", "items": []}
            groups.append(cur)
        cur["items"].append((kind, body))
    lessons = []
    for gi, g in enumerate(groups):
        blocks = []
        for kind, body in g["items"]:
            if kind == "md":
                body2, tables = table_blocks(body)
                for piece in re.split(r"(\x00TABLE\d+\x00)", body2):
                    tm = re.match(r"\x00TABLE(\d+)\x00", piece)
                    if tm:
                        blocks.append(tables[int(tm.group(1))])
                        continue
                    for ch in md_chunks(clean_md(piece)):
                        blocks.append({"type": "text", "md": ch})
            else:
                code = re.sub(r"^#\|.*\n", "", body, flags=re.M).strip()
                if not code or code.startswith("# ---") or "test_unit_" in code or code.startswith("if __name__"):
                    continue
                code = solution_of(code + "\n").strip()
                lines = code.count("\n") + 1
                if lines > 60:
                    first = code.split("\n")[0][:80]
                    blocks.append({"type": "callout", "kind": "note", "title": "Code in the exercise file",
                                   "md": "This part of the module is %d lines of code (starting with `%s`). You will find it in the exercise file at the end of this chapter." % (lines, first.replace("`", "'"))})
                else:
                    blocks.append({"type": "code", "lang": "python", "code": code})
        if not blocks:
            continue
        if blocks[0]["type"] not in ("text", "callout"):
            blocks.insert(0, {"type": "text", "md": "This part of the module: **%s**." % g["title"]})
        blocks.append({"type": "summary", "points": ["You have read %s; the exercise at the end of the chapter asks you to implement it." % g["title"]]})
        lessons.append({"title": g["title"][:80], "summary": "TinyTorch %s: %s" % (name, g["title"][:60]),
                        "source": {"chapter": cid, "sections": [g["title"]]}, "blocks": blocks})
    # merge tiny lessons into the previous one
    merged = []
    for les in lessons:
        words = sum(wc(b.get("md", "") + b.get("code", "")) for b in les["blocks"])
        if merged and words < 250:
            merged[-1]["blocks"] = merged[-1]["blocks"][:-1] + les["blocks"]
            merged[-1]["source"]["sections"] += les["source"]["sections"]
        else:
            merged.append(les)
    for les in merged:
        les["blocks"] = [b for b in les["blocks"] if b["type"] != "summary"] + [
            {"type": "summary", "points": ["You worked through: %s." % ", ".join(les["source"]["sections"][:4])]}]
    return merged


def write(path, obj):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)


def build_deps(course):
    dst = os.path.join(course, "exercises", "_tinytorch", "tinytorch")
    if os.path.isdir(dst):
        shutil.rmtree(dst)
    for f in sorted(glob.glob(os.path.join(SRC, "[0-9][0-9]_*", "[0-9][0-9]_*.py"))):
        s, exp = module_info(f)
        parts = exp.split(".")
        d = os.path.join(dst, *parts[:-1])
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, parts[-1] + ".py"), "w", encoding="utf-8") as fh:
            fh.write(solution_of(s))
    for base, _, _ in os.walk(dst):
        open(os.path.join(base, "__init__.py"), "a").close()
    # shared deps folder; each exercise links to it as _deps (copied for real by verify_exercises)
    return os.path.dirname(dst)


def gen(course, cid, title, order, force=False):
    num = cid[3:]
    d = glob.glob(os.path.join(SRC, num + "_*"))[0]
    name = os.path.basename(d)[3:]
    src_path = os.path.join(d, os.path.basename(d) + ".py")
    src, exp = module_info(src_path)
    out = os.path.join(course, "content", cid)
    if os.path.exists(os.path.join(out, DEEP_MARKER)) and not force:
        return "deep (kept)"
    # ---- exercise
    fname = exp.split(".")[-1] + ".py"
    ex_name = "%s-%s" % (cid, name.replace("_", "-"))
    ex = os.path.join(course, "exercises", ex_name)
    if os.path.isdir(ex):
        shutil.rmtree(ex)
    os.makedirs(os.path.join(ex, "_solution"))
    starter, n_todo = starter_of(src)
    tests = tests_of(src)
    open(os.path.join(ex, fname), "w", encoding="utf-8").write(starter)
    open(os.path.join(ex, "_solution", fname), "w", encoding="utf-8").write(solution_of(src))
    open(os.path.join(ex, "test_module.py"), "w", encoding="utf-8").write(
        TEST_TEMPLATE.format(fname=fname, modname="tinytorch." + exp, tests=tests))
    os.symlink(os.path.join("..", "_tinytorch"), os.path.join(ex, "_deps"))
    write(os.path.join(ex, "exercise.json"), {"title": title, "language": "python",
                                              "command": ["python3", "-m", "unittest", "-v", "test_module"],
                                              "timeout": 240, "starter": [fname], "tests": ["test_module.py"]})
    # ---- lessons
    if os.path.isdir(out):
        for f in glob.glob(os.path.join(out, "*.json")):
            os.remove(f)
    os.makedirs(out, exist_ok=True)
    lessons = lessons_from(src, cid, name)
    obj = re.search(r"Learning Objectives.*?\n((?:\d\..*\n)+)", src)
    goals = [re.sub(r"^\d\.\s*", "", g).strip() for g in obj.group(1).strip().split("\n")] if obj else []
    write(os.path.join(out, "chapter.json"), {"title": title, "order": order, "layer": "imported",
                                              "summary": "Build it yourself: the %s module of TinyTorch." % name.replace("_", " "),
                                              "goals": goals[:6]})
    for i, les in enumerate(lessons, 1):
        write(os.path.join(out, "%02d-%s.json" % (i, re.sub(r"[^a-z0-9]+", "-", les["title"].lower()).strip("-")[:30] or "part")), les)
    write(os.path.join(out, "90-build-it.json"), {
        "title": "Build it: %s" % name.replace("_", " ").title(),
        "summary": "Implement the module's core functions and make its unit tests pass.",
        "source": {"chapter": cid, "sections": ["exercise"]},
        "blocks": [
            {"type": "text", "md": "Time to write the code. The file `%s` contains the whole module, with %d core part%s replaced by "
                                   "`raise NotImplementedError`. Each `TODO(n)` sits under a docstring that says exactly what to build. "
                                   "The tests are the module's own `test_unit_*` functions; run them as often as you like and watch them turn green one by one."
                                   % (fname, n_todo, "" if n_todo == 1 else "s")},
            {"type": "callout", "kind": "tip", "title": "How to work",
             "md": "Open the editor below (or the file in your own editor), fill in one TODO, press **Run tests**, read the first failure, repeat. "
                   "Earlier TinyTorch modules are already provided as a finished package, so you only write this module."},
            {"type": "exercise", "id": cid + "-ex-build", "title": "Implement %s" % name.replace("_", " "),
             "difficulty": "hard" if n_todo > 3 else "medium", "minutes": 20 + 10 * n_todo,
             "goal": "Fill in the %d TODO part%s of `%s` so that every unit test passes." % (n_todo, "" if n_todo == 1 else "s", fname),
             "behavior": "Each `TODO(n)` replaces code described by the docstring right above it. The tests (%s) call your functions with small "
                         "tensors and compare the results with the expected values." % ", ".join("`%s`" % t for t in tests[:8]),
             "hints": ["Read the docstring above each TODO: it lists the inputs, outputs and an example.",
                       "Most parts are a few lines of NumPy on `self.data` wrapped back into a `Tensor`.",
                       "Run the tests after each TODO: the failing test's name tells you which function to look at."],
             "exercise_dir": ex_name,
             "solution_explain": "The reference solution is the original TinyTorch implementation of this module."},
            {"type": "summary", "points": ["You implemented the %s module and its tests pass." % name.replace("_", " "),
                                           "Later modules import exactly this code, the same way PyTorch builds on its tensor core."]}]})
    return "%d lessons, %d TODOs, %d tests" % (len(lessons) + 1, n_todo, len(tests))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("course")
    ap.add_argument("chapters", nargs="*")
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    build_deps(a.course)
    state = json.load(open(os.path.join(a.course, ".build", "state.json"), encoding="utf-8"))
    for i, c in enumerate(state["chapters"]):
        if c["id"].startswith("tt-") and (not a.chapters or c["id"] in a.chapters):
            print("%-6s %s" % (c["id"], gen(a.course, c["id"], c["title"], i + 1, a.force)))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Turn the MLSysBook Quarto sources (books/vol1-4) and TinyTorch modules into the
extract layout book-to-course expects: OUTDIR/manifest.json, outline.md, chapters/<id>.md.

Chapter ids: v1-01 … v4-18 for the textbook volumes, tt-01 … tt-20 for TinyTorch.
Python cells, Quarto div fences, index markers and figure embeds are stripped; inline
`{python} X.y_str` computed values become «value» so the prose stays readable.
"""
import json, os, re, sys, glob

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
VOLS = {"vol1": "Introduction to Machine Learning Systems", "vol2": "Scaling Machine Learning Systems",
        "vol3": "Agentic Machine Learning Systems", "vol4": "Physical AI"}


def clean_qmd(text):
    text = re.sub(r"^---\n.*?\n---\n", "", text, flags=re.S)
    text = re.sub(r"```\{python\}.*?```", "", text, flags=re.S)
    text = re.sub(r"```\{=\w+\}.*?```", "", text, flags=re.S)
    text = re.sub(r"<!--.*?-->", "", text, flags=re.S)
    text = re.sub(r"`\{python\}\s*([^`]+)`", lambda m: "«" + m.group(1).split(".")[-1].replace("_str", "").replace("_math", "") + "»", text)
    text = re.sub(r"\\index\{[^}]*\}", "", text)
    text = re.sub(r"^:::.*$", "", text, flags=re.M)
    text = re.sub(r"^!\[[^\]]*\]\([^)]*\)\{[^}]*\}\s*$", "", text, flags=re.M)
    text = re.sub(r"^\\(chapterminitoc|noindent)\s*$", "", text, flags=re.M)
    text = re.sub(r"\s\{#(sec|fig|tbl|eq|lst)-[^}]*\}", "", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip() + "\n"


def headings(md):
    out = []
    for line in md.splitlines():
        m = re.match(r"^(#{1,3}) (.+)$", line)
        if m:
            out.append({"level": len(m.group(1)), "text": m.group(2).strip()})
    return out


def main(outdir):
    os.makedirs(os.path.join(outdir, "chapters"), exist_ok=True)
    chapters, total = [], 0
    for vol, vtitle in VOLS.items():
        vn = vol[-1]
        for d in sorted(glob.glob(os.path.join(ROOT, "books", vol, "[0-9][0-9]_*"))):
            num = os.path.basename(d)[:2]
            qmds = sorted(glob.glob(os.path.join(d, "[0-9][0-9]_*.qmd")))
            if not qmds:
                continue
            raw = open(qmds[0], encoding="utf-8").read()
            md = clean_qmd(raw)
            m = re.search(r'^title:\s*"?([^"{\n]+)', raw, re.M) or re.search(r"^# (.+)$", md, re.M)
            title = (m.group(1).strip() if m else os.path.basename(d)[3:].replace("_", " ").title())
            cid = "v%s-%s" % (vn, num)
            rel = "chapters/%s.md" % cid
            open(os.path.join(outdir, rel), "w", encoding="utf-8").write("# %s\n\n%s" % (title, md))
            w = len(md.split()); total += w
            chapters.append({"id": cid, "title": "Vol %s · %s" % ("I II III IV".split()[int(vn) - 1], title),
                             "file": rel, "words": w, "kind": "chapter", "headings": headings(md),
                             "src": os.path.relpath(qmds[0], ROOT), "dir": os.path.relpath(d, ROOT)})
    for d in sorted(glob.glob(os.path.join(ROOT, "tinytorch", "src", "[0-9][0-9]_*"))):
        num, name = os.path.basename(d)[:2], os.path.basename(d)[3:]
        py = os.path.join(d, os.path.basename(d) + ".py")
        if not os.path.exists(py):
            continue
        src = open(py, encoding="utf-8").read()
        # keep markdown cells as prose, code cells as fenced python
        parts, md = re.split(r"^# %%.*$", src, flags=re.M), []
        for p in parts:
            s = p.strip()
            mm = re.match(r'^r?"""(.*)"""$', s, re.S)
            md.append(mm.group(1).strip() if mm else ("```python\n%s\n```" % s if s and not s.startswith("# ---") else ""))
        body = "\n\n".join(x for x in md if x)
        cid = "tt-%s" % num
        rel = "chapters/%s.md" % cid
        open(os.path.join(outdir, rel), "w", encoding="utf-8").write(body + "\n")
        w = len(body.split()); total += w
        chapters.append({"id": cid, "title": "TinyTorch %s · %s" % (num, name.replace("_", " ").title()),
                         "file": rel, "words": w, "kind": "chapter", "headings": headings(body),
                         "src": os.path.relpath(py, ROOT), "dir": os.path.relpath(d, ROOT)})
    # One learning arc: TinyTorch "build it" modules sit right after the Vol I chapter they make concrete.
    arc = (["v1-%02d" % i for i in (1, 2, 3, 4, 5)] + ["tt-%02d" % i for i in (1, 2, 3, 4)]
           + ["v1-06", "v1-07", "v1-08"] + ["tt-%02d" % i for i in range(5, 14)]
           + ["v1-%02d" % i for i in (9, 10, 11, 12)] + ["tt-%02d" % i for i in range(14, 20)]
           + ["v1-%02d" % i for i in (13, 14, 15, 16)] + ["tt-20"])
    rank = {c: i for i, c in enumerate(arc)}
    chapters.sort(key=lambda c: (rank.get(c["id"], 1000), c["id"]))
    manifest = {"title": "Machine Learning Systems: The Complete Interactive Course", "author": "Vijay Janapa Reddi et al. (MLSysBook)",
                "language": "en", "source": "harvard-edge/cs249r_book", "format": "qmd", "total_words": total, "chapters": chapters}
    json.dump(manifest, open(os.path.join(outdir, "manifest.json"), "w"), indent=1, ensure_ascii=False)
    with open(os.path.join(outdir, "outline.md"), "w") as f:
        f.write("# %s\n\n%d words in %d chapters\n\n" % (manifest["title"], total, len(chapters)))
        for c in chapters:
            f.write("## %s — %s (%d words)\n" % (c["id"], c["title"], c["words"]))
            for h in c["headings"]:
                if h["level"] == 2:
                    f.write("- %s\n" % h["text"])
    print("chapters:", len(chapters), "words:", total)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "work/extract")

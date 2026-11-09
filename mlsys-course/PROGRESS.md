# MLSys course: progress log

This file is the memory of the build. Read it first when you continue the work, and add to it after
every milestone. Branch: `claude/project-thread-i38on5`.

## What exists today

One course, 91 chapters, in the book's own teaching order: Vol I ch1 to 5, TinyTorch 01 to 04, Vol I
ch6 to 8, TinyTorch 05 to 13, Vol I ch9 to 12, TinyTorch 14 to 19, Vol I ch13 to 16, TinyTorch 20, then
Vol II, Vol III and Vol IV. About 1,080 lessons.

| Layer | What a learner gets | Where it comes from | Chapters |
|---|---|---|---|
| Imported | Overview (concept map, formulas, flashcards, warm-up quiz), one lesson per book section with objectives, a short excerpt, a section map, a reveal and the book's own quiz questions, and a chapter test | `mlsys-course-tools/generate_chapter.py` from the book's quiz banks and concept maps | all Vol I to IV chapters |
| Build | TinyTorch lessons plus an in-page editor for the module file, unit tests run by the course helper, reference solution | `mlsys-course-tools/gen_tinytorch.py` | tt-01 to tt-20 (20 exercises, all verified) |
| Lab | A hand-written lab after the matching section: worked derivation or stepper, calculator task, Python playground with a check, numeric quiz | `mlsys-course-tools/labs.py` | v1-01, v1-08, v1-10, v1-11, v1-13, v1-14, v2-05, v2-15, v3-05 |
| Deep | Fully hand-written lessons (marker file `content/<id>/.deep`; generators then skip the chapter) | by hand | none yet |

Known gaps: Vol III and Vol IV have no quiz banks, so their practice is synthesized (claim matching and
true/false from the concept maps); v3-20 has no concepts, so it has no practice or test; TinyTorch
chapters have no chapter test (their exercise is the test).

## How to build, run and check

```bash
python3 mlsys-course-tools/labs.py mlsys-course        # rewrite labs, self-test every playground
python3 mlsys-course-tools/build.py mlsys-course       # validate, write course/data.js + course/ch/*.js
python3 ~/.claude/skills/book-to-course/scripts/verify_exercises.py mlsys-course   # TinyTorch: starter fails, solution passes
cd mlsys-course && ./start.sh                            # or: python3 serve.py
```

The player (`index.html`, `assets/`, `serve.py`) is this course's own; do not refresh it with
`init_course.py --update`, which would overwrite it with the generic book-to-course player.

`serve.py` endpoints: `/api/progress` (GET/POST), `/api/run-tests`, `/api/save-exercise` (only files
listed as `starter` in that exercise's `exercise.json`), `/api/run-python` (playground; `python3 -I`
in a temp folder, 20 s limit, localhost only).

Progress lives in `progress/progress.json` (gitignored) and in the browser. The Logbook page exports
and imports it as JSON.

## Design

- `PRODUCT.md`: who it is for and what it must do (impeccable init).
- `DESIGN.md`: Neo Kinpaku, copied from impeccable; the visual guide.
- `.impeccable/surfaces/index-html.md`: the surface brief (mode Read, code-led), including the direction
  contract. Structure chosen by the user: reading column plus a margin apparatus. Signature: the live
  margin, where each practice block's state (open in gold, done in patina) sits beside it and the
  lesson record at the top of the margin counts what is still open.
- Stack chosen by the user: plain HTML, CSS and JS that runs offline. Fonts are local (OFL).

## impeccable command log

| # | Command | Date | Result |
|---|---|---|---|
| 1 | init | 2026-11-09 | PRODUCT.md written; platform web |
| 2 | shape | 2026-11-09 | surface brief and direction contract; user picked the margin-apparatus structure |
| 3 | craft (new-work, code-led) | 2026-11-09 | new player built: rail, reading column, live margin, calculators, playground, logbook |
| 4 | detect | 2026-11-09 | 7 findings on the first pass, all fixed (off-ramp sizes, a hover contrast clash on the skip link, an undocumented colour, a 1px radius, inline font families); the light theme's paper is DESIGN.md's own light-paper token, kept on purpose |
| 5 | audit | 2026-11-09 | 16/20; report in `.impeccable/reports/audit-2026-11-09.md` (stepper dots as tiny touch targets, h1 to h3 jumps, global reduced-motion kill, small phone targets, faint editor line numbers) |
| 6 | critique | 2026-11-09 | 26/40, dual agent; snapshot in `.impeccable/critique/`. P0: phone users could not reach Playground, Logbook, Glossary. P1: progress ignored practice; lesson badges wrong; imported lessons left the margin empty. P2: logbook said "finished" but listed visits |
| 7 | polish | 2026-11-09 | all critique and audit issues fixed: drawer nav, auto-complete when practice is done, per-lesson badges, calculator links and book terms in the margin (glossary 1 to 973 terms), outcomes in the logbook, `[` `]` lesson keys, Escape frees Tab in the editor, h2 block headings, 24 px dot targets |
| 8 | layout | 2026-11-09 | practice notes stay sticky beside long quizzes, exercises and playgrounds |
| 9 | typeset | 2026-11-09 | `text-wrap: pretty` on prose, record numeral tracking, chart ticks 12 px, exercise sub-headings at h3 |
| 10 | colorize | 2026-11-09 | share bars (gold, patina, faint, deep gold with legend) in the iron law, memory and energy calculators |
| 11 | animate | 2026-11-09 | one authored moment: a margin note settles from gold to patina when its practice is done; reduced motion keeps fades |
| 12 | clarify | 2026-11-09 | lesson intros lead with objectives, "What the section covers" only when it has two or more parts, takeaways name the ideas instead of repeating objectives, wrong answers show the hint |
| 13 | adapt | 2026-11-09 | 44 px drawer tiles, larger breadcrumb, copy and slider targets on phones; glossary overflow fixed |
| 14 | harden | 2026-11-09 | helper-down messages for playground and tests, save state shows "Saving", save failures surface as a banner on phones |
| 15 | onboard | 2026-11-09 | first visit replaces zero stats with How it works (Read, Try, Prove) and a 25-minute lab as the fastest first win |
| 16 | optimize | 2026-11-09 | `content-visibility` on the 91 home rows; glossary renders at most 300 matches |
| 17 | delight | 2026-11-09 | day streak on the home record and in the Logbook |
| 18 | distill | 2026-11-09 | header save state shortened (path moved to its tooltip); single-bullet section maps and template intros removed |
| 19 | bolder (quieter assessed, not needed) | 2026-11-09 | home masthead carries the course's scope as display numerals |
| 20 | document | 2026-11-09 | DESIGN.md merged (not overwritten): new "Course Player" component section |

## Milestones

- 2026-11-09: scaffold, extract of all four volumes and TinyTorch, imported layer for every chapter.
- 2026-11-09: TinyTorch build exercises (20/20 verified), PRODUCT.md.
- 2026-11-09: new player (reading column + margin), ten calculators, Python playground, in-page exercise
  editor, per-chapter data files (data.js went from 11.6 MB to 0.4 MB plus one file per chapter).
- 2026-11-09: nine hands-on labs.
- 2026-11-09: impeccable sequence complete (commands 4 to 20 above).
- 2026-11-09: phone access: `start-lan.sh` / `serve.py --lan` serves the course on the home Wi-Fi behind a private key link (cookie); phone and PC share one progress file.

## Next

1. Re-run critique to measure the change from 26/40.
2. More labs, then deep chapters, starting with Vol I ch1 to ch5.
3. TinyTorch chapter quizzes; practice for v3-20.

---
version: 1
slug: "index-html"
primary_target: "index.html"
related_targets: []
---

# Course player (index.html)

Scope: the whole course player: home ledger, lesson view, playground pane, logbook. Mode: Read (lessons) with Operate moments (playgrounds, exercises, tests). Build path: code-led.

Audience and job: self-directed learners working through MLSysBook across weeks; each visit they must see where they stand, learn one lesson, practise it, and leave with the record saved.

Constraints: plain static HTML/CSS/JS, offline, data from course/data.js (book-to-course schema plus playground and widget blocks), about 1,100 lessons.

## Direction contract

THESIS: Every paragraph of the course has a margin, and the margin is where the learner works: terms, formulas, calculators and their own record sit beside the sentence they belong to, the way a well-annotated technical manual or a scholar's edition does. Refuses the category default of a full-width lesson page with practice stacked below the reading.

OWN-WORLD: Neo Kinpaku from DESIGN.md. Lacquer black ground, raised lacquer panels, neutral hairlines, kinpaku gold for the current position and primary actions only, verdigris patina for done/improved state, vermilion only for wrong answers. Alumni Sans thin for mastheads and chapter openers, Albert Sans for reading and UI, mono for margin labels, numbers and code. Light theme on warm paper with patina links.

STORY: The learner opens the course, sees the contents with their position and every chapter's state, steps into the next lesson, reads a calm column while the margin defines each new term, holds the formula and offers a live calculator for it, works the practice inline and watches the margin record each result.

FIRST VIEWPORT (lesson): Thin running head (wordmark, chapter title, overall progress as a gold hairline gauge, theme toggle). Left: collapsible chapter contents rail. Centre: chapter title in Alumni Sans 300, lesson title, then the reading column at 68ch. Right margin about 300px: the lesson record (practice items with state) at the top, then notes aligned to the paragraph they annotate. Home: masthead with a resume line and gold Continue button, then contents by volume with each chapter's state in the margin.

FORM: Reading column with margin apparatus, position 4 on the ranked list (user locked it over the dealt lead on 2026-11-09). seed:0214a2b738755239

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Signature interaction: the live margin. Each block has a margin cell; when a quiz is answered, a calculator moved or a test run, its margin note changes state (gold while open, patina when done) and the lesson record at the top of the margin updates, so the learner's work is visible next to the text that asked for it.

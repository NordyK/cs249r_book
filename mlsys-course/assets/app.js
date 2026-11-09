/* Book-to-course player. No dependencies. Works from file:// (progress in browser)
   and through serve.py (progress in progress/progress.json, tests runnable from the page). */
(function () {
"use strict";
const C = window.COURSE;
if (!C) { document.body.innerHTML = "<p style='padding:2rem'>Missing course/data.js: run python3 mlsys-course-tools/build.py mlsys-course first.</p>"; return; }

/* ───────────── i18n ─────────────
   UI strings live in the skill's assets/i18n/<ui_lang>/strings.json; build_course.py bundles the course's
   language into course/data.js as C.ui, with English filling any key that language lacks. */
const L = C.ui || {};
const t = (k, ...a) => { let s = L[k] != null ? L[k] : k; a.forEach((v, i) => { s = s.split("{" + i + "}").join(v); }); return s; };

/* ───────────── tiny DOM helpers ───────────── */
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else if (k.slice(0, 2) === "on" && typeof v === "function") el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat(Infinity)) { if (kid == null || kid === false) continue; el.append(kid.nodeType ? kid : document.createTextNode(String(kid))); }
  return el;
}
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const $ = (s, r) => (r || document).querySelector(s);
/* replaceChildren() stringifies arrays and null — fill() flattens, drops empties and accepts text */
/* the renderers pass optional children as `cond ? node : null`; drop those instead of printing "null" */
for (const m of ["append", "replaceChildren", "prepend"]) {
  const orig = Element.prototype[m];
  Element.prototype[m] = function (...kids) { return orig.apply(this, kids.filter(k => k != null && k !== false)); };
}
function fill(el, ...kids) { el.replaceChildren(...kids.flat(Infinity).filter(k => k != null && k !== false).map(k => (k.nodeType ? k : document.createTextNode(String(k))))); return el; }
/* in-page confirm — native window.confirm is silently "false" in Android WebView */
function ask(msg, yes) {
  const close = () => { ov.remove(); document.removeEventListener("keydown", key); };
  const key = e => { if (e.key === "Escape") close(); };
  const ok = h("button", { class: "btn", type: "button", onclick: () => { close(); yes(); } }, t("dlgYes"));
  const ov = h("div", { class: "dlg-ov", onclick: e => { if (e.target === ov) close(); } },
    h("div", { class: "dlg", role: "dialog", "aria-modal": "true" }, h("p", null, msg),
      h("div", { class: "dlg-act" }, h("button", { class: "btn ghost", type: "button", onclick: close }, t("dlgNo")), ok)));
  document.addEventListener("keydown", key); document.body.append(ov); ok.focus();
}
function add(el, ...kids) { kids.flat(Infinity).forEach(k => { if (k != null && k !== false) el.append(k.nodeType ? k : document.createTextNode(String(k))); }); return el; }
const wait = ms => new Promise(r => setTimeout(r, ms));
const reduceMotion = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ───────────── LaTeX → MathML translator ─────────────
   A small, dependency-free subset: algebra, functions, big operators, matrices/cases,
   sets/logic, Greek letters, common fonts and spacing. Unknown input never throws past
   tex2mml() — it falls back to the raw source so a broken formula never blanks the page.
   Command names below are also the lint allowlist read by scripts/build_course.py — keep
   the two in sync by only adding names inside the MATH-CMDS-START/END string literals. */
/* MATH-CMDS-START */
const MATH_CMD_NAMES = (
  "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi pi rho sigma tau upsilon phi chi psi omega " +
  "varepsilon vartheta varpi varrho varsigma varphi Gamma Delta Theta Lambda Xi Pi Sigma Upsilon Phi Psi Omega " +
  "cdot times div pm mp ast circ ne neq le leq ge geq ll gg approx equiv sim simeq cong propto infty partial nabla degree " +
  "to rightarrow leftarrow leftrightarrow Rightarrow Leftarrow Leftrightarrow implies iff mapsto " +
  "in notin ni subset subseteq supset supseteq cup cap setminus emptyset varnothing forall exists nexists neg lnot land wedge lor vee mid colon " +
  "ldots cdots vdots ddots dots langle rangle lfloor rfloor lceil rceil vert Vert lvert rvert lVert rVert " +
  "sin cos tan cot sec csc arcsin arccos arctan sinh cosh tanh log ln lg exp deg gcd dim ker Pr det " +
  "sum prod coprod int iint iiint oint bigcup bigcap bigoplus lim limsup liminf max min sup inf limits nolimits " +
  "hat widehat bar overline vec tilde widetilde dot ddot overbrace underbrace overrightarrow underline " +
  "mathbb mathcal mathfrak mathbf mathit mathsf mathtt mathrm boldsymbol " +
  "frac dfrac tfrac binom sqrt left right begin end text textrm textbf textit operatorname quad qquad phantom pmod bmod " +
  "matrix pmatrix bmatrix Bmatrix vmatrix Vmatrix cases aligned array"
).split(" ");
/* MATH-CMDS-END */

const GREEK = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", zeta: "ζ", eta: "η", theta: "θ", iota: "ι",
  kappa: "κ", lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", pi: "π", rho: "ρ", sigma: "σ", tau: "τ", upsilon: "υ",
  phi: "φ", chi: "χ", psi: "ψ", omega: "ω",
  varepsilon: "ϵ", vartheta: "ϑ", varpi: "ϖ", varrho: "ϱ", varsigma: "ς", varphi: "ϕ",
  Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π", Sigma: "Σ", Upsilon: "Υ", Phi: "Φ", Psi: "Ψ", Omega: "Ω"
};
const SYM = {
  cdot: "·", times: "×", div: "÷", pm: "±", mp: "∓", ast: "∗", circ: "∘",
  ne: "≠", neq: "≠", le: "≤", leq: "≤", ge: "≥", geq: "≥", ll: "≪", gg: "≫",
  approx: "≈", equiv: "≡", sim: "∼", simeq: "≃", cong: "≅", propto: "∝",
  infty: "∞", partial: "∂", nabla: "∇", degree: "°",
  to: "→", rightarrow: "→", leftarrow: "←", leftrightarrow: "↔",
  Rightarrow: "⇒", Leftarrow: "⇐", Leftrightarrow: "⇔", implies: "⇒", iff: "⇔", mapsto: "↦",
  in: "∈", notin: "∉", ni: "∋", subset: "⊂", subseteq: "⊆", supset: "⊃", supseteq: "⊇",
  cup: "∪", cap: "∩", setminus: "∖", emptyset: "∅", varnothing: "∅",
  forall: "∀", exists: "∃", nexists: "∄", neg: "¬", lnot: "¬", land: "∧", wedge: "∧", lor: "∨", vee: "∨",
  mid: "∣", colon: ":", ldots: "…", cdots: "⋯", vdots: "⋮", ddots: "⋱", dots: "…",
  langle: "⟨", rangle: "⟩", lfloor: "⌊", rfloor: "⌋", lceil: "⌈", rceil: "⌉",
  vert: "|", Vert: "‖", lvert: "|", rvert: "|", lVert: "‖", rVert: "‖"
};
const FUNCS = {}; "sin cos tan cot sec csc arcsin arccos arctan sinh cosh tanh log ln lg exp deg gcd dim ker Pr det".split(" ").forEach(w => { FUNCS[w] = 1; });
const BIGOPS = {
  sum: { sym: "∑", limits: true }, prod: { sym: "∏", limits: true }, coprod: { sym: "∐", limits: true },
  int: { sym: "∫", limits: false }, iint: { sym: "∬", limits: false }, iiint: { sym: "∭", limits: false }, oint: { sym: "∮", limits: false },
  bigcup: { sym: "⋃", limits: true }, bigcap: { sym: "⋂", limits: true }, bigoplus: { sym: "⊕", limits: true },
  lim: { text: true, limits: true }, limsup: { text: true, limits: true }, liminf: { text: true, limits: true },
  max: { text: true, limits: true }, min: { text: true, limits: true }, sup: { text: true, limits: true }, inf: { text: true, limits: true }
};
const ACCENT_OVER = { hat: "^", widehat: "^", bar: "‾", overline: "‾", vec: "→", tilde: "~", widetilde: "~", dot: "˙", ddot: "¨", overbrace: "⏞", overrightarrow: "→" };
const ACCENT_UNDER = { underline: "_", underbrace: "⏟" };
const FONT_CMDS = {}; "mathbb mathcal mathfrak mathbf mathit mathsf mathtt mathrm boldsymbol".split(" ").forEach(w => { FONT_CMDS[w] = 1; });
const SPACE_EM = { ",": 0.1667, ":": 0.2222, ";": 0.2778, "!": -0.1667, " ": 0.25 };
const DELIMS = {
  "(": "(", ")": ")", "[": "[", "]": "]", "|": "|", ".": "",
  "\\{": "{", "\\}": "}", "\\|": "‖", "\\langle": "⟨", "\\rangle": "⟩",
  "\\lfloor": "⌊", "\\rfloor": "⌋", "\\lceil": "⌈", "\\rceil": "⌉"
};
const ENVS = {
  matrix: { delim: null }, pmatrix: { delim: ["(", ")"] }, bmatrix: { delim: ["[", "]"] },
  Bmatrix: { delim: ["\\{", "\\}"] }, vmatrix: { delim: ["|", "|"] }, Vmatrix: { delim: ["‖", "‖"] },
  cases: { delim: ["\\{", null], align: "left" }, aligned: { delim: null, align: "right left" }, array: { delim: null }
};
const CODEPOINT_FONTS = {
  mathbb: { upper: 0x1D538, lower: 0x1D552, digit: 0x1D7D8, exceptions: { C: "ℂ", H: "ℍ", N: "ℕ", P: "ℙ", Q: "ℚ", R: "ℝ", Z: "ℤ" } },
  mathcal: { upper: 0x1D49C, lower: 0x1D4B6, digit: null, exceptions: { B: "ℬ", E: "ℰ", F: "ℱ", H: "ℋ", I: "ℐ", L: "ℒ", M: "ℳ", R: "ℛ", e: "ℯ", g: "ℊ", o: "ℴ" } },
  mathfrak: { upper: 0x1D504, lower: 0x1D51E, digit: null, exceptions: { C: "ℭ", H: "ℌ", I: "ℑ", R: "ℜ", Z: "ℨ" } }
};
function mapMathLetter(ch, font) {
  const def = CODEPOINT_FONTS[font];
  if (def.exceptions[ch]) return def.exceptions[ch];
  if (/[A-Z]/.test(ch)) return String.fromCodePoint(def.upper + (ch.charCodeAt(0) - 65));
  if (/[a-z]/.test(ch)) return String.fromCodePoint(def.lower + (ch.charCodeAt(0) - 97));
  if (/[0-9]/.test(ch) && def.digit != null) return String.fromCodePoint(def.digit + (ch.charCodeAt(0) - 48));
  return ch;
}

function mathTokenize(src) {
  const re = /\\\\|\\[A-Za-z]+|\\[,:;!\s{}|%$&#_^~]|[{}^_&]|\d+(?:\.\d+)?|[A-Za-z]|\s+|./gs;
  const toks = []; let m;
  while ((m = re.exec(src))) {
    const v = m[0];
    if (/^\s+$/.test(v)) continue;
    let k;
    if (v === "\\\\") k = "rowbreak";
    else if (v[0] === "\\" && v.length > 1 && /[A-Za-z]/.test(v[1])) k = "cmd";
    else if (v[0] === "\\") k = "esc";
    else if (v === "{" || v === "}") k = "brace";
    else if (v === "^" || v === "_") k = "script";
    else if (v === "&") k = "amp";
    else if (/^\d/.test(v)) k = "num";
    else if (/^[A-Za-z]$/.test(v)) k = "ident";
    else k = "op";
    toks.push({ k, v, pos: m.index });
  }
  return toks;
}

function mathParse(src) {
  const tokens = mathTokenize(src);
  let i = 0;
  const peek = () => tokens[i];
  const atEnd = () => i >= tokens.length;
  const next = () => tokens[i++];
  function fail(msg) { throw { mathErr: true, message: msg }; }

  function wrapRow(parts) { return parts.length === 1 ? parts[0].mml : "<mrow>" + parts.map(p => p.mml).join("") + "</mrow>"; }

  function parseScripted() {
    const base = parseAtom();
    let limits = !!base.limits;
    if (!atEnd() && peek().k === "cmd" && (peek().v === "\\limits" || peek().v === "\\nolimits")) limits = next().v === "\\limits";
    let sub = null, sup = null;
    while (!atEnd() && peek().k === "script") {
      const s = next(); const val = parseArg();
      if (s.v === "_") { if (sub) fail("double subscript"); sub = val; }
      else { if (sup) fail("double superscript"); sup = val; }
    }
    if (!sub && !sup) return base;
    const tag = limits ? (sub && sup ? "munderover" : sub ? "munder" : "mover") : (sub && sup ? "msubsup" : sub ? "msub" : "msup");
    const kids = [base.mml]; if (sub) kids.push(sub.mml); if (sup) kids.push(sup.mml);
    return { mml: "<" + tag + ">" + kids.join("") + "</" + tag + ">" };
  }

  function parseGroupInner() {
    next();
    const parts = [];
    while (!atEnd() && !(peek().k === "brace" && peek().v === "}")) parts.push(parseScripted());
    if (atEnd()) fail("unbalanced { }");
    next();
    return wrapRow(parts.length ? parts : [{ mml: "" }]);
  }

  function parseArg() {
    if (atEnd()) fail("expected an argument");
    if (peek().k === "brace" && peek().v === "{") return { mml: parseGroupInner() };
    return parseAtom();
  }

  function optArg() {
    if (!atEnd() && peek().k === "op" && peek().v === "[") {
      next(); const parts = [];
      while (!atEnd() && !(peek().k === "op" && peek().v === "]")) parts.push(parseScripted());
      if (atEnd()) fail("unbalanced [ ]");
      next();
      return wrapRow(parts.length ? parts : [{ mml: "" }]);
    }
    return null;
  }

  function readRawArg() {
    if (atEnd()) fail("expected an argument");
    if (peek().k === "brace" && peek().v === "{") {
      const open = next(); let depth = 1, endPos = null;
      while (!atEnd() && depth > 0) {
        const tk = next();
        if (tk.k === "brace" && tk.v === "{") depth++;
        else if (tk.k === "brace" && tk.v === "}") { depth--; if (depth === 0) endPos = tk.pos; }
      }
      if (endPos == null) fail("unbalanced { }");
      return src.slice(open.pos + 1, endPos);
    }
    return next().v;
  }

  function readDelim() {
    if (atEnd()) fail("expected a delimiter after \\left or \\right");
    const tok = next();
    if (!(tok.v in DELIMS)) fail("'" + tok.v + "' is not a valid \\left/\\right delimiter");
    return DELIMS[tok.v];
  }

  function decorate(tag, ch) {
    const a = parseArg();
    return { mml: "<" + tag + ' accent="true">' + a.mml + '<mo stretchy="true">' + esc(ch) + "</mo></" + tag + ">" };
  }

  function fracAtom(name) {
    const num = parseArg(), den = parseArg();
    const disp = name === "dfrac" ? ' displaystyle="true"' : name === "tfrac" ? ' displaystyle="false"' : "";
    return { mml: "<mfrac" + disp + ">" + num.mml + den.mml + "</mfrac>" };
  }
  function binomAtom() {
    const n = parseArg(), k = parseArg();
    return { mml: '<mrow><mo stretchy="true">(</mo><mfrac linethickness="0">' + n.mml + k.mml + '</mfrac><mo stretchy="true">)</mo></mrow>' };
  }
  function sqrtAtom() {
    const idx = optArg(); const a = parseArg();
    return idx ? { mml: "<mroot>" + a.mml + idx + "</mroot>" } : { mml: "<msqrt>" + a.mml + "</msqrt>" };
  }
  function leftAtom() {
    const open = readDelim(); const parts = [];
    while (!atEnd() && !(peek().k === "cmd" && peek().v === "\\right")) parts.push(parseScripted());
    if (atEnd()) fail("\\left without a matching \\right");
    next(); const close = readDelim();
    const o = open ? '<mo stretchy="true" fence="true">' + esc(open) + "</mo>" : "";
    const c = close ? '<mo stretchy="true" fence="true">' + esc(close) + "</mo>" : "";
    return { mml: "<mrow>" + o + wrapRow(parts.length ? parts : [{ mml: "" }]) + c + "</mrow>" };
  }
  function readEnvName() {
    if (atEnd() || !(peek().k === "brace" && peek().v === "{")) fail("expected { after \\begin or \\end");
    return readRawArg();
  }
  function envAtom() {
    const name = readEnvName();
    if (!(name in ENVS)) fail("unknown environment '" + name + "'");
    const def = ENVS[name];
    const rows = [[[]]];
    for (;;) {
      if (atEnd()) fail("\\begin{" + name + "} without a matching \\end");
      const p = peek();
      if (p.k === "cmd" && p.v === "\\end") {
        next(); const en = readEnvName();
        if (en !== name) fail("\\begin{" + name + "} closed by \\end{" + en + "}");
        break;
      }
      if (p.k === "rowbreak") { next(); rows.push([[]]); continue; }
      if (p.k === "amp") { next(); rows[rows.length - 1].push([]); continue; }
      rows[rows.length - 1][rows[rows.length - 1].length - 1].push(parseScripted());
    }
    const aligns = (def.align || "center").split(" ");
    const trs = rows.filter(r => r.length > 1 || r[0].length > 0)
      .map(cells => "<mtr>" + cells.map((parts, ci) => '<mtd columnalign="' + aligns[Math.min(ci, aligns.length - 1)] + '">' + wrapRow(parts.length ? parts : [{ mml: "" }]) + "</mtd>").join("") + "</mtr>")
      .join("");
    let mml = "<mtable>" + trs + "</mtable>";
    if (def.delim) {
      const [o, c] = def.delim;
      const om = o ? '<mo stretchy="true" fence="true">' + esc(DELIMS[o] != null ? DELIMS[o] : o) + "</mo>" : "";
      const cm = c ? '<mo stretchy="true" fence="true">' + esc(DELIMS[c] != null ? DELIMS[c] : c) + "</mo>" : "";
      mml = "<mrow>" + om + mml + cm + "</mrow>";
    }
    return { mml };
  }
  function textAtom(style) {
    const raw = readRawArg();
    const sty = style === "bold" ? ' style="font-weight:bold"' : style === "italic" ? ' style="font-style:italic"' : "";
    return { mml: "<mtext" + sty + ">" + esc(raw) + "</mtext>" };
  }
  function operatornameAtom() { return { mml: "<mi>" + esc(readRawArg()) + "</mi>" }; }
  function pmodAtom() {
    const a = parseArg();
    return { mml: '<mrow><mspace width="0.3em"></mspace><mo>(</mo><mi>mod</mi><mspace width="0.3em"></mspace>' + a.mml + "<mo>)</mo></mrow>" };
  }
  function fontAtom(name) {
    const raw = readRawArg();
    if (name === "mathbb" || name === "mathcal" || name === "mathfrak") {
      const mapped = [...raw].map(ch => /[A-Za-z0-9]/.test(ch) ? mapMathLetter(ch, name) : ch).join("");
      return { mml: "<mi>" + esc(mapped) + "</mi>" };
    }
    if (name === "mathrm") return { mml: '<mi mathvariant="normal">' + esc(raw) + "</mi>" };
    const sty = name === "mathbf" || name === "boldsymbol" ? "font-weight:bold" : name === "mathit" ? "font-style:italic" : "";
    const variant = name === "mathsf" ? ' mathvariant="sans-serif"' : name === "mathtt" ? ' mathvariant="monospace"' : "";
    return { mml: "<mi" + variant + (sty ? ' style="' + sty + '"' : "") + ">" + esc(raw) + "</mi>" };
  }

  function cmdAtom(name) {
    if (name in GREEK) return { mml: "<mi>" + GREEK[name] + "</mi>" };
    if (name in SYM) return { mml: "<mo>" + SYM[name] + "</mo>" };
    if (name in FUNCS) return { mml: "<mi>" + name + "</mi>" };
    if (name in BIGOPS) { const o = BIGOPS[name]; return { mml: o.text ? "<mi>" + name + "</mi>" : "<mo>" + o.sym + "</mo>", limits: o.limits }; }
    if (name in ACCENT_OVER) return decorate("mover", ACCENT_OVER[name]);
    if (name in ACCENT_UNDER) return decorate("munder", ACCENT_UNDER[name]);
    if (name in FONT_CMDS) return fontAtom(name);
    switch (name) {
      case "frac": case "dfrac": case "tfrac": return fracAtom(name);
      case "binom": return binomAtom();
      case "sqrt": return sqrtAtom();
      case "left": return leftAtom();
      case "right": fail("\\right without a matching \\left"); break;
      case "begin": return envAtom();
      case "end": fail("\\end without a matching \\begin"); break;
      case "text": case "textrm": return textAtom();
      case "textbf": return textAtom("bold");
      case "textit": return textAtom("italic");
      case "operatorname": return operatornameAtom();
      case "quad": return { mml: '<mspace width="1em"></mspace>' };
      case "qquad": return { mml: '<mspace width="2em"></mspace>' };
      case "phantom": parseArg(); return { mml: "<mspace></mspace>" };
      case "pmod": return pmodAtom();
      case "bmod": return { mml: '<mo lspace="0.3em" rspace="0.3em">mod</mo>' };
      default: fail("unknown command \\" + name);
    }
  }

  function opAtom(ch) { return { mml: ch === "'" ? "<mo>′</mo>" : "<mo>" + esc(ch) + "</mo>" }; }
  function escAtom(ch) {
    if (ch in SPACE_EM) return { mml: '<mspace width="' + SPACE_EM[ch] + 'em"></mspace>' };
    if (ch === "~") return { mml: '<mspace width="0.25em"></mspace>' };
    return { mml: "<mo>" + esc(ch) + "</mo>" };
  }
  function parseAtom() {
    if (atEnd()) fail("unexpected end of formula");
    const tok = peek();
    if (tok.k === "brace" && tok.v === "{") return { mml: parseGroupInner() };
    if (tok.k === "brace") fail("unexpected }");
    if (tok.k === "num") { next(); return { mml: "<mn>" + esc(tok.v) + "</mn>" }; }
    if (tok.k === "ident") { next(); return { mml: "<mi>" + esc(tok.v) + "</mi>" }; }
    if (tok.k === "amp" || tok.k === "rowbreak") fail("unexpected '" + tok.v + "' outside a matrix/cases environment");
    if (tok.k === "op") { next(); return opAtom(tok.v); }
    if (tok.k === "esc") { next(); return escAtom(tok.v.slice(1)); }
    if (tok.k === "cmd") { next(); return cmdAtom(tok.v.slice(1)); }
    fail("unexpected token '" + tok.v + "'");
  }

  const parts = [];
  while (!atEnd()) parts.push(parseScripted());
  return wrapRow(parts.length ? parts : [{ mml: "" }]);
}

/* MathML Core shipped in Chrome/Edge 109 (Jan 2023); older browsers treat <math>/<mfrac>/…
   as unknown inline elements with no special layout, so a real fraction renders no taller
   than a single bare number — that gap is the signal this probe checks for. */
let mathmlOk = null;
function mathmlSupported() {
  if (mathmlOk !== null) return mathmlOk;
  try {
    const probe = h("div", { style: "position:absolute;visibility:hidden;left:-9999px;top:-9999px" });
    document.body.append(probe);
    // measure the <math> element itself, not the wrapper div — an unsupported browser gives
    // it no special layout, so its own height stays flat instead of growing with the fraction
    probe.innerHTML = '<math><mfrac><mn>1</mn><mn>2</mn></mfrac></math>';
    const fracH = probe.firstChild.getBoundingClientRect().height;
    probe.innerHTML = '<math><mn>1</mn></math>';
    const plainH = probe.firstChild.getBoundingClientRect().height;
    probe.remove();
    // no usable layout yet (e.g. probed inside a hidden/display:none ancestor) — can't tell
    // either way, so assume supported and don't cache a guess; a later real call can re-probe
    if (!plainH) return true;
    mathmlOk = fracH > plainH * 1.3;
  } catch (e) { mathmlOk = true; }
  return mathmlOk;
}
let mathmlWarned = false;
function tex2mml(src, display) {
  if (!mathmlSupported()) {
    if (!mathmlWarned) { mathmlWarned = true; document.body.prepend(h("div", { class: "mathml-warn" }, "⚠ " + t("mathmlUnsupported"))); }
    const raw = (display ? "$$" : "$") + src + (display ? "$$" : "$");
    return '<span class="math-raw" title="' + esc(t("mathmlUnsupported")) + '">' + esc(raw) + "</span>";
  }
  try {
    const body = mathParse(String(src == null ? "" : src));
    return '<math display="' + (display ? "block" : "inline") + '">' + body + "</math>";
  } catch (e) {
    const msg = (e && e.mathErr) ? e.message : "math error";
    const raw = (display ? "$$" : "$") + src + (display ? "$$" : "$");
    return '<span class="math-err" title="' + esc(msg) + '">' + esc(raw) + "</span>";
  }
}

/* ───────────── mini markdown (safe: escapes everything first) ───────────── */
function inline(s) {
  const codes = [], maths = [];
  s = String(s).replace(/`([^`]+)`/g, (m, c) => { codes.push(c); return "\u0000" + (codes.length - 1) + "\u0000"; });
  s = s.replace(/\\\$/g, () => "\u0002");
  s = s.replace(/\$\$([^\n]+?)\$\$|\$(?=\S)([^$\n]*[^\s$])\$(?!\d)/g, (m, disp, inl) => {
    const body = disp != null ? disp : inl; maths.push(tex2mml(body, disp != null));
    return "\u0001" + (maths.length - 1) + "\u0001";
  });
  s = esc(s);
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, "$1<em>$2</em>");
  s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  s = s.replace(/\u0001(\d+)\u0001/g, (m, i) => maths[+i]);
  s = s.replace(/\u0002/g, "$");
  return s.replace(/\u0000(\d+)\u0000/g, (m, i) => "<code>" + esc(codes[+i]) + "</code>");
}
function md(src) {
  const lines = String(src == null ? "" : src).replace(/\r/g, "").split("\n");
  const isList = l => /^\s*([-*]|\d+\.)\s+/.test(l);
  let html = "", i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    let m;
    if (/^```/.test(l)) {
      const lang = l.replace(/^```/, "").trim(); const buf = []; i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      html += '<div class="code-wrap"><pre><code>' + highlightLines(buf.join("\n"), lang).map(x => '<span class="ln">' + x + "</span>").join("") + "</code></pre></div>";
      continue;
    }
    if (/^\$\$/.test(l)) {
      let rest = l.replace(/^\$\$/, ""); const buf = [];
      const closeIdx = rest.indexOf("$$");
      if (closeIdx >= 0) { buf.push(rest.slice(0, closeIdx)); i++; }
      else {
        buf.push(rest); i++;
        while (i < lines.length && lines[i].indexOf("$$") < 0) buf.push(lines[i++]);
        if (i < lines.length) { buf.push(lines[i].slice(0, lines[i].indexOf("$$"))); i++; }
      }
      html += '<div class="mathblock">' + tex2mml(buf.join("\n"), true) + "</div>";
      continue;
    }
    if ((m = /^(#{1,4})\s+(.*)$/.exec(l))) { const n = Math.min(m[1].length + 2, 6); html += "<h" + n + ">" + inline(m[2]) + "</h" + n + ">"; i++; continue; }
    if (/^>\s?/.test(l)) { const buf = []; while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, "")); html += "<blockquote>" + inline(buf.join(" ")) + "</blockquote>"; continue; }
    if (isList(l)) {
      const ordered = /^\s*\d+\./.test(l); const items = [];
      while (i < lines.length && isList(lines[i])) items.push(lines[i++].replace(/^\s*([-*]|\d+\.)\s+/, ""));
      const tag = ordered ? "ol" : "ul";
      html += "<" + tag + ">" + items.map(x => "<li>" + inline(x) + "</li>").join("") + "</" + tag + ">"; continue;
    }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !isList(lines[i]) && !/^#{1,4}\s/.test(lines[i]) && !/^>/.test(lines[i]) && !/^```/.test(lines[i]) && !/^\$\$/.test(lines[i])) buf.push(lines[i++]);
    html += "<p>" + inline(buf.join(" ")) + "</p>";
  }
  return html;
}

/* ───────────── syntax highlighting (small, dependency-free) ───────────── */
const KW = {
  go: ["break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var", "true false nil iota", "append cap close copy delete len make new panic print println recover string int int8 int16 int32 int64 uint uint8 uint16 uint32 uint64 uintptr float32 float64 bool byte rune error any"],
  python: ["and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case", "True False None self cls", "print len range int str float list dict set tuple bool type input open enumerate zip map filter sum min max abs sorted reversed isinstance super"],
  js: ["async await break case catch class const continue debugger default delete do else export extends finally for from function if import in instanceof let new of return static super switch this throw try typeof var void while with yield interface type enum implements public private protected readonly", "true false null undefined NaN Infinity", "console Math JSON Object Array String Number Boolean Promise Map Set Date Error require module process"],
  java: ["abstract assert break case catch class const continue default do else enum extends final finally for goto if implements import instanceof interface native new package private protected public return static strictfp super switch synchronized this throw throws transient try volatile while var record", "true false null", "String Integer Long Double Boolean List Map Set System Object Math ArrayList HashMap"],
  c: ["auto break case const continue default do else enum extern for goto if inline register return sizeof static struct switch typedef union volatile while class namespace template typename public private protected virtual new delete using nullptr", "true false NULL", "int char float double long short unsigned signed void bool size_t printf scanf malloc free std string vector cout cin endl"],
  rust: ["as async await break const continue crate dyn else enum extern fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait type unsafe use where while", "true false None Some Ok Err", "i8 i16 i32 i64 u8 u16 u32 u64 usize isize f32 f64 bool char str String Vec Option Result Box println vec"],
  bash: ["if then else elif fi for while do done case esac in function return exit local export source alias unset set", "true false", "echo cd ls cat grep sed awk chmod mkdir rm cp mv curl git sudo npm pip python go"],
  sql: ["select from where and or not insert into values update set delete create table drop alter add join inner left right outer on group by order having limit offset as distinct union all null is in like between primary key foreign references index view", "true false null", "count sum avg min max coalesce"]
};
const ALIAS = { golang: "go", py: "python", python3: "python", javascript: "js", node: "js", jsx: "js", ts: "js", typescript: "js", tsx: "js", cpp: "c", "c++": "c", "c#": "java", cs: "java", kotlin: "java", shell: "bash", sh: "bash", zsh: "bash", rs: "rust", mysql: "sql", postgres: "sql", sqlite: "sql" };
const COMMENTS = { go: ["//", "/*"], js: ["//", "/*"], java: ["//", "/*"], c: ["//", "/*"], rust: ["//", "/*"], python: ["#"], bash: ["#"], sql: ["--", "/*"] };
const reCache = {};
function langDef(lang) {
  const k = ALIAS[String(lang || "").toLowerCase()] || String(lang || "").toLowerCase();
  if (!KW[k]) return null;
  if (!reCache[k]) {
    const [kw, lit, bi] = KW[k].map(s => new Set(s.split(" ")));
    const com = COMMENTS[k] || [];
    const parts = [];
    if (com.indexOf("/*") >= 0) parts.push("\\/\\*[\\s\\S]*?(?:\\*\\/|$)");
    if (com.indexOf("//") >= 0) parts.push("\\/\\/[^\\n]*");
    if (com.indexOf("#") >= 0) parts.push("#[^\\n]*");
    if (com.indexOf("--") >= 0) parts.push("--[^\\n]*");
    if (k === "python") parts.push('"""[\\s\\S]*?(?:"""|$)', "'''[\\s\\S]*?(?:'''|$)");
    parts.push('"(?:\\\\.|[^"\\\\\\n])*"', "'(?:\\\\.|[^'\\\\\\n])*'");
    if (k === "go" || k === "js") parts.push("`[^`]*`");
    parts.push("\\b0x[0-9a-fA-F_]+\\b|\\b\\d[\\d_]*(?:\\.\\d+)?(?:[eE][+-]?\\d+)?\\b", "[A-Za-z_$][\\w$]*");
    reCache[k] = { re: new RegExp(parts.join("|"), "g"), kw, lit, bi, ci: k === "sql" };
  }
  return reCache[k];
}
function highlightLines(code, lang) {
  const def = langDef(lang);
  const lines = [""];
  const push = (cls, text) => {
    const pieces = text.split("\n");
    pieces.forEach((p, i) => {
      if (i > 0) lines.push("");
      if (p) lines[lines.length - 1] += cls ? '<span class="tk-' + cls + '">' + esc(p) + "</span>" : esc(p);
    });
  };
  code = String(code == null ? "" : code).replace(/\r/g, "").replace(/\n+$/, "");
  if (!def) { push("", code); return lines; }
  let last = 0, m;
  def.re.lastIndex = 0;
  while ((m = def.re.exec(code))) {
    if (m.index > last) push("", code.slice(last, m.index));
    const tok = m[0]; let cls = "";
    const c = tok[0];
    if (tok.startsWith("//") || tok.startsWith("/*") || tok.startsWith("--") || (c === "#" && !/^#include|^#define/.test(tok) && true)) cls = "com";
    else if (c === '"' || c === "'" || c === "`") cls = "str";
    else if (/^\d/.test(tok)) cls = "num";
    else {
      const w = def.ci ? tok.toLowerCase() : tok;
      if (def.kw.has(w)) cls = "kw"; else if (def.lit.has(w)) cls = "lit"; else if (def.bi.has(w)) cls = "bi";
      else if (code[def.re.lastIndex] === "(") cls = "fn";
    }
    push(cls, tok); last = def.re.lastIndex;
    if (tok.length === 0) def.re.lastIndex++;
  }
  if (last < code.length) push("", code.slice(last));
  return lines;
}
const EXT = { go: "go", py: "python", js: "js", mjs: "js", ts: "ts", java: "java", c: "c", h: "c", cpp: "cpp", rs: "rust", sh: "bash", sql: "sql", json: "json" };
const langOf = p => EXT[String(p || "").split(".").pop().toLowerCase()] || "";

function copyText(text, btn) {
  const done = () => { const o = btn.textContent; btn.textContent = t("copied"); setTimeout(() => (btn.textContent = o), 1200); };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, done);
  else { const ta = h("textarea", { style: "position:fixed;opacity:0" }); ta.value = text; document.body.append(ta); ta.select(); try { document.execCommand("copy"); } catch (e) { /* ignore */ } ta.remove(); done(); }
}
function codeBlock(o) {
  const hl = new Set(o.highlight || []);
  const lines = highlightLines(o.code, o.lang || langOf(o.file));
  const copy = h("button", { class: "copy-btn", type: "button", onclick: () => copyText(o.code, copy) }, t("copy"));
  const wrap = h("div", { class: "code-wrap" },
    h("div", { class: "code-head" }, h("span", null, o.file || o.lang || ""), copy),
    h("pre", null, h("code", null, lines.map((ln, i) => h("span", { class: "ln" + (hl.has(i + 1) ? " hl" : ""), html: ln })))));
  return o.caption ? h("div", null, wrap, h("div", { class: "code-caption", html: inline(o.caption) })) : wrap;
}
function sanitizeSvg(src) {
  const tpl = document.createElement("template"); tpl.innerHTML = String(src);
  tpl.content.querySelectorAll("script,foreignObject,iframe,object,embed").forEach(n => n.remove());
  tpl.content.querySelectorAll("*").forEach(n => [...n.attributes].forEach(a => {
    if (/^on/i.test(a.name) || (/^(xlink:)?href$/i.test(a.name) && /^\s*javascript:/i.test(a.value))) n.removeAttribute(a.name);
  }));
  return tpl.innerHTML;
}

/* ═════════════ MLSys course player (Neo Kinpaku, reading column + margin apparatus) ═════════════
   Everything above this line is the book-to-course core (DOM helpers, LaTeX→MathML, mini markdown,
   highlighting). Everything below is this course's player: chapter-at-a-time loading, the margin,
   playgrounds, calculators, the logbook. */

/* ───────────── icons (authored, 1.5px stroke, 20px grid) ───────────── */
const ICON_PATHS = {
  check: "M4 10.5l4 4 8-9", x: "M5 5l10 10M15 5L5 15", arrow: "M4 10h12M11 5l5 5-5 5", back: "M16 10H4M9 5L4 10l5 5",
  chevron: "M7 4l6 6-6 6", down: "M4 7l6 6 6-6", play: "M6 4l10 6-10 6z", menu: "M3 6h14M3 10h14M3 14h14",
  sun: "M10 6.5a3.5 3.5 0 110 7 3.5 3.5 0 010-7zM10 1.5v2M10 16.5v2M1.5 10h2M16.5 10h2M4 4l1.4 1.4M14.6 14.6L16 16M4 16l1.4-1.4M14.6 5.4L16 4",
  moon: "M15.5 12.5A6.5 6.5 0 017.5 4.5a6.5 6.5 0 108 8z", hint: "M7.5 15.5h5M8 18h4M10 2a5.5 5.5 0 00-3.3 9.9c.5.4.8 1 .8 1.6h5c0-.6.3-1.2.8-1.6A5.5 5.5 0 0010 2z",
  flask: "M8 2.5h4M8.5 2.5v5L3.8 15.4A1.5 1.5 0 005.1 17.5h9.8a1.5 1.5 0 001.3-2.1L11.5 7.5v-5M6 12h8",
  calc: "M5 2.5h10a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1v-13a1 1 0 011-1zM6.5 5h7v3h-7zM7 11h.01M10 11h.01M13 11h.01M7 14h.01M10 14h.01M13 14h.01",
  flag: "M4.5 18V3M4.5 3.5h10l-2.5 4 2.5 4h-10", book: "M3 4.5A1.5 1.5 0 014.5 3H9v13H4.5A1.5 1.5 0 003 17.5zM17 4.5A1.5 1.5 0 0015.5 3H11v13h4.5a1.5 1.5 0 011.5 1.5z",
  eye: "M1.5 10S4.5 4 10 4s8.5 6 8.5 6-3 6-8.5 6S1.5 10 1.5 10zM10 7.5a2.5 2.5 0 110 5 2.5 2.5 0 010-5z", code: "M7 6l-4 4 4 4M13 6l4 4-4 4",
  log: "M5 3h10v14H5zM8 7h4M8 10h4M8 13h2", search: "M8.5 3a5.5 5.5 0 110 11 5.5 5.5 0 010-11zM12.5 12.5L17 17", save: "M4 3h9l3 3v11H4zM7 3v4h5V3M7 17v-5h6v5",
  cards: "M3 6h11v10H3zM6 3h11v10", hammer: "M11 7l-7.5 7.5a1.4 1.4 0 002 2L13 9M10 4.5l3-1.5 4 4-1.5 3-2.5-.5-2.5-2.5z", reset: "M4 10a6 6 0 106-6H6M6 1.5L3.5 4 6 6.5",
};
function icon(name, cls) {
  const ns = "http://www.w3.org/2000/svg", s = document.createElementNS(ns, "svg");
  s.setAttribute("viewBox", "0 0 20 20"); s.setAttribute("aria-hidden", "true"); s.setAttribute("class", "ic" + (cls ? " " + cls : ""));
  const p = document.createElementNS(ns, "path"); p.setAttribute("d", ICON_PATHS[name] || ""); s.append(p); return s;
}
const fmtInt = n => Number(n).toLocaleString("en-US");

/* ───────────── progress storage ───────────── */
const BLANK = () => ({ version: 2, lessons: {}, quizzes: {}, exercises: {}, cards: {}, playgrounds: {}, widgets: {}, log: [], last: null, updated: null });
let P = BLANK();
let serverMode = false, saveTimer = null;
const LS_KEY = "course-progress:" + C.meta.id;
async function loadProgress() {
  let local = null;
  try { local = JSON.parse(localStorage.getItem(LS_KEY) || "null"); } catch (e) { /* private window */ }
  let remote = null;
  if (location.protocol.indexOf("http") === 0) {
    try {
      const r = await fetch("api/ping", { cache: "no-store" });
      if (r.ok && (await r.json()).ok) { serverMode = true; const pr = await fetch("api/progress", { cache: "no-store" }); remote = await pr.json(); }
    } catch (e) { serverMode = false; }
  }
  const newer = (a, b) => ((a && a.updated) || "") >= ((b && b.updated) || "") ? a : b;
  const pick = serverMode ? (remote && remote.updated ? newer(remote, local) : (local || remote)) : local;
  if (pick && typeof pick === "object") P = Object.assign(BLANK(), pick);
  if (serverMode && local && pick === local) save(true);
}
function save(now) {
  P.updated = new Date().toISOString();
  try { localStorage.setItem(LS_KEY, JSON.stringify(P)); } catch (e) { /* storage full or blocked */ }
  const post = () => {
    if (!serverMode) return;
    fetch("api/progress", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(P) })
      .then(r => { if (!r.ok) throw new Error(); setSaveState("ok"); }).catch(() => setSaveState("err"));
  };
  clearTimeout(saveTimer);
  if (now) post(); else saveTimer = setTimeout(post, 350);
  setSaveState(serverMode ? "pending" : "local"); refreshChrome();
}
function setSaveState(s) {
  const el = $("#saveState"); if (!el) return;
  el.dataset.state = s || (serverMode ? "ok" : "local");
  el.textContent = s === "err" ? "Not saved: the course helper stopped" : serverMode ? "Saved to progress/progress.json" : "Saved in this browser";
}
/* the logbook: one line per thing the learner finished, so a later session knows what happened */
function logEvent(kind, ref, text) {
  P.log = P.log || [];
  const last = P.log[P.log.length - 1];
  if (last && last.kind === kind && last.ref === ref && Date.now() - Date.parse(last.at) < 60000) { last.text = text; last.at = new Date().toISOString(); return; }
  P.log.push({ at: new Date().toISOString(), kind, ref, text });
  if (P.log.length > 2000) P.log.splice(0, P.log.length - 2000);
}

/* ───────────── course model ───────────── */
const ORDER = [], CH_OF = {}, STUB = {}, CH_BY_ID = {};
C.chapters.forEach((ch, ci) => { CH_BY_ID[ch.id] = ch; (ch.stubs || []).forEach(s => { ORDER.push(s.id); CH_OF[s.id] = ci; STUB[s.id] = s; }); });
const LES = {};
const lessonDone = id => !!(P.lessons[id] && P.lessons[id].completed);
const lessonStarted = id => !!(P.lessons[id] && (P.lessons[id].visited || P.lessons[id].completed));
const chDone = ch => ch.stubs.filter(s => lessonDone(s.id)).length;
const overallPct = () => ORDER.length ? Math.round(1000 * ORDER.filter(lessonDone).length / ORDER.length) / 10 : 0;
function testOf(ch) { for (const s of ch.stubs) for (const q of s.quizzes) if (q.test) return q.id; return null; }
function exOf(ch) { const out = []; ch.stubs.forEach(s => out.push(...s.exercises)); return out; }
function nextLessonId() { const first = ORDER.find(id => !lessonDone(id)); return (P.last && STUB[P.last] && !lessonDone(P.last)) ? P.last : first; }
const chLabel = ch => { const m = /^(Vol [IV]+|TinyTorch \d+)\s*·\s*(.*)$/.exec(ch.title); return m ? { tag: m[1], name: m[2] } : { tag: "", name: ch.title }; };
const loading = {};
function loadChapter(id) {
  if (LES[id]) return Promise.resolve(LES[id]);
  if (loading[id]) return loading[id];
  loading[id] = new Promise((res, rej) => {
    const s = document.createElement("script"); s.src = "course/ch/" + encodeURIComponent(id) + ".js";
    s.onload = () => (LES[id] ? res(LES[id]) : rej(new Error("chapter file is empty")));
    s.onerror = () => { delete loading[id]; rej(new Error("course/ch/" + id + ".js could not be loaded")); };
    document.head.append(s);
  });
  return loading[id];
}
window.__courseChapter = (id, lessons) => { LES[id] = lessons; };
function celebrate() {
  if (!document.body.animate) return;
  const seam = h("div", { class: "seam-flash", "aria-hidden": "true" }); document.body.append(seam);
  if (reduceMotion()) { seam.animate([{ opacity: 0 }, { opacity: 1, offset: .3 }, { opacity: 0 }], { duration: 700 }).onfinish = () => seam.remove(); return; }
  seam.animate([{ transform: "scaleX(0)", opacity: 1 }, { transform: "scaleX(1)", opacity: 1, offset: .6 }, { transform: "scaleX(1)", opacity: 0 }], { duration: 1100, easing: "cubic-bezier(.16,1,.3,1)" }).onfinish = () => seam.remove();
}

/* ───────────── margin helpers ───────────── */
/* a row pairs a block in the reading column with its margin cell */
function row(mainEl, sideKids, cls) {
  const side = h("aside", { class: "side" }, sideKids);
  return h("div", { class: "mrow" + (cls ? " " + cls : "") }, h("div", { class: "main" }, mainEl), side);
}
function note(label, body, state) {
  return h("div", { class: "mnote" + (state ? " is-" + state : "") }, label ? h("div", { class: "mlabel" }, label) : null, body);
}
const termsSeen = new Set();
function termNotes(b, les) {
  if (!les.terms || !les.terms.length) return [];
  const text = JSON.stringify([b.md, b.title, b.steps, b.nodes, b.prompt]).toLowerCase();
  const out = [];
  les.terms.forEach(tm => {
    const k = tm.term.toLowerCase();
    if (!termsSeen.has(k) && text.indexOf(k) >= 0) { termsSeen.add(k); out.push(note("Term", h("div", null, h("strong", null, tm.term), " ", h("span", { html: inline(tm.def) })))); }
  });
  return out;
}
const CALC_HINTS = [
  ["iron-law", /iron law/], ["roofline", /roofline|arithmetic intensity|ridge point/], ["amdahl", /amdahl/],
  ["memory", /optimizer state|memory footprint|activation memory/], ["quantize", /quantiz/], ["batching", /dynamic batching|batch size/],
  ["allreduce", /all-?reduce/], ["kvcache", /kv[ -]cache|key-value cache/], ["energy", /energy per (byte|operation|access)|picojoule|\bpj\b/],
  ["degradation", /silent degradation|data drift|distribution shift/]];
function calcNotes(b, les) {
  if (["text", "callout", "from_book", "reveal", "derivation"].indexOf(b.type) < 0 || !window.WIDGETS) return [];
  const own = les._widgets || (les._widgets = new Set((les.blocks || []).filter(x => x.type === "widget").map(x => x.widget)));
  const text = (String(b.md || "") + " " + String(b.prompt || "") + " " + String(b.title || "")).toLowerCase();
  const out = [];
  CALC_HINTS.forEach(([k, re]) => {
    if (out.length || own.has(k) || calcSeen.has(k) || !re.test(text) || !window.WIDGETS[k]) return;
    calcSeen.add(k);
    out.push(note("Try the numbers", h("div", null, h("a", { href: "#/playground/" + k }, icon("calc"), " " + window.WIDGETS[k].title + " calculator"))));
  });
  return out;
}
const calcSeen = new Set();
function formulaNotes(b) {
  if (b.type !== "text" && b.type !== "callout") return [];
  const out = [], seen = new Set();
  String(b.md || "").replace(/\$\$([\s\S]+?)\$\$/g, (m, f) => { if (!seen.has(f)) { seen.add(f); out.push(f); } return m; });
  return out.slice(0, 2).map(f => note("Formula", h("div", { class: "mformula", html: tex2mml(f.trim(), true) })));
}

/* ───────────── blocks ───────────── */
const CALLOUT_LABEL = { tip: "Tip", note: "Note", warning: "Watch out", analogy: "Analogy", key: "Remember", example: "Example" };
function blockTitle(text, ic, extra) { return h("h2", { class: "block-title" }, ic ? icon(ic) : null, h("span", null, text), extra || null); }

function renderBlock(b, les) {
  switch (b.type) {
    case "text": return h("div", { class: "block text" }, b.title ? h("h2", { class: "block-title" }, b.title) : null, h("div", { html: md(b.md) }));
    case "callout": { const kind = CALLOUT_LABEL[b.kind] ? b.kind : "note";
      return h("aside", { class: "block callout is-" + kind }, h("div", { class: "c-title" }, b.title || CALLOUT_LABEL[kind]), h("div", { html: md(b.md) })); }
    case "code": return h("div", { class: "block" }, b.title ? h("h4", null, b.title) : null, codeBlock(b),
      b.output ? [h("div", { class: "out-label" }, b.output_label || "Output"), h("pre", { class: "term" }, b.output)] : null, b.explain ? h("div", { class: "text", html: md(b.explain) }) : null);
    case "stepper": return stepperBlock(b);
    case "derivation": return derivationBlock(b);
    case "reveal": return revealBlock(b);
    case "from_book": return h("figure", { class: "block frombook" }, h("blockquote", { html: md(b.md) }), b.code ? codeBlock({ code: b.code, lang: b.lang }) : null);
    case "table": return h("div", { class: "block tablewrap" }, h("table", null, h("thead", null, h("tr", null, b.headers.map(x => h("th", { html: inline(x) })))), h("tbody", null, b.rows.map(r => h("tr", null, r.map(c => h("td", { html: inline(c) })))))));
    case "flow": return flowBlock(b);
    case "svg": return h("figure", { class: "block svgfig" }, h("div", { html: sanitizeSvg(b.svg) }), b.caption ? h("figcaption", { html: inline(b.caption) }) : null);
    case "quiz": return quizBlock(b, les);
    case "exercise": return exerciseBlock(b, les);
    case "flashcards": return flashBlock(b);
    case "playground": return playgroundBlock(b, les);
    case "widget": return widgetBlock(b, les);
    case "summary": return h("div", { class: "block summary" }, h("h2", { class: "block-title" }, b.title || "What to take away"), h("ul", null, b.points.map(p => h("li", { html: inline(p) }))));
    default: return h("div", { class: "block" }, "[" + b.type + "]");
  }
}
/* the margin cell for a block: citation, terms, formulas, and live state for practice */
function sideFor(b, les, live) {
  const out = [];
  if (b.type === "from_book") out.push(note("From the book", h("div", null, b.source || "MLSysBook")));
  if (b.type === "code" && (b.caption || b.file)) out.push(note(b.file ? "File" : "Listing", h("div", { html: inline(b.caption || b.file) })));
  if (b.note) out.push(note("Note", h("div", { html: md(b.note) })));
  out.push(...formulaNotes(b), ...calcNotes(b, les), ...termNotes(b, les));
  if (live) out.push(live);
  return out;
}

function stepControls(n, onStep) {
  let idx = 0;
  const dots = h("div", { class: "dots" }), meta = h("div", { class: "note-small" });
  const prev = h("button", { class: "btn ghost sm", type: "button", onclick: () => go(idx - 1, "prev") }, icon("back"), "Back");
  const next = h("button", { class: "btn sm", type: "button", onclick: () => go(idx + 1, "next") }, "Next", icon("arrow"));
  function go(i, dir) {
    idx = Math.max(0, Math.min(n - 1, i));
    dots.replaceChildren(...Array.from({ length: n }, (_, j) => h("button", { class: "dot" + (j === idx ? " on" : j < idx ? " past" : ""), type: "button", "aria-label": "Step " + (j + 1) + " of " + n, onclick: () => go(j, j > idx ? "next" : "prev") })));
    meta.textContent = "Step " + (idx + 1) + " of " + n; prev.disabled = idx === 0; next.disabled = idx === n - 1;
    onStep(idx, dir);
  }
  return { row: h("div", { class: "row" }, prev, next, meta), dots, go, get idx() { return idx; } };
}
function stepperBlock(b) {
  const stage = h("div", { class: "stepper-stage", "aria-live": "polite" });
  const ctl = stepControls(b.steps.length, (idx, dir) => {
    const s = b.steps[idx];
    stage.className = "stepper-stage"; void stage.offsetWidth; if (dir) stage.classList.add("anim-" + dir);
    fill(stage, h("div", { class: "step-title" }, s.title || ""), s.md ? h("div", { html: md(s.md) }) : null, s.code ? codeBlock({ code: s.code, lang: s.lang || b.lang, highlight: s.highlight, file: s.file }) : null, s.output ? [h("div", { class: "out-label" }, "Output"), h("pre", { class: "term" }, s.output)] : null);
  });
  const root = h("div", { class: "block stepper" }, blockTitle(b.title || "Walkthrough"), ctl.dots, stage, ctl.row);
  ctl.go(0); return root;
}
function derivationBlock(b) {
  const rel0 = b.rel || "="; let showAll = false;
  const rows = b.steps.map(s => h("div", { class: "dv-row" }, h("span", { class: "dv-lhs", html: s.lhs ? tex2mml(String(s.lhs), false) : "" }), h("span", { class: "dv-rel", html: tex2mml(s.rel || rel0, false) }), h("span", { class: "dv-rhs", html: tex2mml(String(s.rhs), false) }), h("div", { class: "dv-why", html: s.why ? md(s.why) : "" })));
  const sync = idx => rows.forEach((r, i) => { r.classList.toggle("hidden", !showAll && i > idx); r.classList.toggle("cur", !showAll && i === idx); r.classList.toggle("past", showAll ? i !== idx : i < idx); });
  const ctl = stepControls(b.steps.length, idx => sync(idx));
  const allBtn = h("button", { class: "btn ghost sm", type: "button", onclick: () => { showAll = !showAll; allBtn.textContent = showAll ? "Step by step" : "Show all"; sync(ctl.idx); } }, "Show all");
  ctl.row.append(allBtn);
  const root = h("div", { class: "block derivation" }, blockTitle(b.title || "Derivation"), b.intro ? h("div", { html: md(b.intro) }) : null, h("div", { class: "dv-rows" }, rows), ctl.dots, ctl.row,
    b.result ? h("div", { class: "dv-result" }, h("strong", null, "Result: "), h("span", { html: tex2mml(String(b.result), false) })) : null, b.note ? h("div", { class: "text", html: md(b.note) }) : null);
  ctl.go(0); return root;
}
function revealBlock(b) {
  const ans = h("div", { class: "answer", html: md(b.md) });
  const btn = h("button", { class: "btn ghost sm", type: "button", "aria-expanded": "false", onclick: () => {
    const open = !ans.isConnected; if (open) root.append(ans); else ans.remove();
    btn.setAttribute("aria-expanded", String(open)); btn.lastChild.textContent = open ? "Hide the answer" : "Show the answer";
  } }, icon("eye"), h("span", null, "Show the answer"));
  const root = h("div", { class: "block reveal" }, h("div", { class: "prompt", html: md(b.prompt) }), h("div", { class: "note-small" }, "Answer in your head or on paper first, then compare."), h("div", { class: "row" }, btn));
  return root;
}
function flowBlock(b) {
  let cur = -1; const track = h("div", { class: "flow-track" }), detail = h("div", { class: "flow-detail", "aria-live": "polite" }), nodes = [];
  b.nodes.forEach((n, i) => { const el = h("button", { class: "flow-node", type: "button", onclick: () => show(i) }, h("span", { class: "fn-i" }, String(i + 1)), h("span", null, n.label)); nodes.push(el); track.append(el); });
  function show(i) { cur = i; nodes.forEach((n, j) => { n.classList.toggle("on", j <= i); n.classList.toggle("cur", j === i); }); detail.innerHTML = md(b.nodes[i].detail || ""); nxt.disabled = i >= b.nodes.length - 1; }
  const nxt = h("button", { class: "btn sm", type: "button", onclick: () => show(cur + 1) }, "Next stage", icon("arrow"));
  return h("div", { class: "block flow" }, blockTitle(b.title || "Process"), track, detail, h("div", { class: "row" }, nxt));
}
/* ───────────── quiz engine ───────────── */
function rng(seedStr) { let a = 0; for (let i = 0; i < seedStr.length; i++) a = (a * 31 + seedStr.charCodeAt(i)) >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let x = Math.imul(a ^ (a >>> 15), 1 | a); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; }
const normTxt = (s, ci) => { s = String(s == null ? "" : s).trim().replace(/\s+/g, " "); return ci === false ? s : s.toLowerCase(); };

function qSingle(q, uid) {
  let sel = null; const labels = [], inputs = [];
  const el = h("div", { class: "opts", role: "radiogroup" }, q.options.map((o, i) => {
    const inp = h("input", { type: "radio", name: uid, value: String(i), onchange: () => { sel = i; labels.forEach((l, j) => l.classList.toggle("sel", j === i)); } });
    const lab = h("label", { class: "opt" }, inp, h("span", { html: inline(o) })); labels.push(lab); inputs.push(inp); return lab;
  }));
  return { el, answered: () => sel !== null, correct: () => sel === q.answer, lock: v => inputs.forEach(i => (i.disabled = v)),
    mark: ok => { labels.forEach((l, j) => { l.classList.remove("good", "bad"); if (j === sel) l.classList.add(ok ? "good" : "bad"); }); },
    reveal: () => { labels.forEach((l, j) => { l.classList.remove("bad"); if (j === q.answer) l.classList.add("good"); }); },
    reset: () => { sel = null; inputs.forEach(i => (i.checked = false)); labels.forEach(l => l.classList.remove("sel", "good", "bad")); } };
}
function qMulti(q, uid) {
  const sel = new Set(); const labels = [], inputs = [];
  const el = h("div", { class: "opts" }, q.options.map((o, i) => {
    const inp = h("input", { type: "checkbox", name: uid, onchange: () => { inp.checked ? sel.add(i) : sel.delete(i); lab.classList.toggle("sel", inp.checked); } });
    const lab = h("label", { class: "opt" }, inp, h("span", { html: inline(o) })); labels.push(lab); inputs.push(inp); return lab;
  }));
  const want = new Set(q.answer);
  return { el, answered: () => sel.size > 0, correct: () => sel.size === want.size && [...sel].every(x => want.has(x)), lock: v => inputs.forEach(i => (i.disabled = v)),
    mark: ok => { labels.forEach((l, j) => { l.classList.remove("good", "bad"); if (sel.has(j)) l.classList.add(want.has(j) ? "good" : "bad"); }); },
    reveal: () => { labels.forEach((l, j) => { l.classList.remove("bad", "good"); if (want.has(j)) l.classList.add("good"); }); },
    reset: () => { sel.clear(); inputs.forEach(i => (i.checked = false)); labels.forEach(l => l.classList.remove("sel", "good", "bad")); } };
}
function qFill(q, uid) {
  const inp = h("input", { type: "text", autocomplete: "off", spellcheck: "false", placeholder: q.placeholder || "Type your answer", "aria-label": "Your answer" });
  const el = h("div", { class: "fill-in" }, inp);
  const accepted = [].concat(q.answer).map(a => normTxt(a, q.ignore_case));
  return { el, answered: () => inp.value.trim() !== "", correct: () => accepted.indexOf(normTxt(inp.value, q.ignore_case)) >= 0, lock: v => (inp.disabled = v),
    mark: ok => { el.classList.remove("good", "bad"); el.classList.add(ok ? "good" : "bad"); },
    reveal: () => { inp.value = [].concat(q.answer)[0]; el.classList.remove("bad"); el.classList.add("good"); },
    reset: () => { inp.value = ""; el.classList.remove("good", "bad"); } };
}
/* A typed number is ambiguous when it has a comma ("0,125" is 0.125 to a pt/pl learner, 125 to
   a US one), so try both readings and accept the answer if either one matches. */
function numReadings(s) {
  s = String(s == null ? "" : s).trim().replace(/[\s\u00A0]+/g, "");
  if (!s) return [];
  const out = [Number(s.replace(/,/g, ""))];                              // comma = grouping: "1,500", "1,234.5"
  if (s.includes(",")) out.push(Number(s.replace(/\./g, "").replace(",", "."))); // comma = decimal: "0,125", "1.234,5"
  return out.filter(n => !Number.isNaN(n));
}
function numericMatches(input, answer, tol) {
  const slash = String(input == null ? "" : input).indexOf("/");
  const candidates = slash < 0 ? numReadings(input) : [].concat(...numReadings(String(input).slice(0, slash)).map(num =>
    numReadings(String(input).slice(slash + 1)).filter(den => den !== 0).map(den => num / den)));
  return candidates.some(v => Math.abs(v - answer) <= tol);
}
function qNumeric(q, uid) {
  const inp = h("input", { type: "text", inputmode: "decimal", autocomplete: "off", spellcheck: "false", placeholder: q.placeholder || "Type your answer", "aria-label": "Your answer" });
  const el = h("div", { class: "fill-in" }, inp, q.unit ? h("span", { class: "note-small" }, " " + q.unit) : null);
  const tol = Math.abs(q.tolerance || 0);
  return { el, answered: () => inp.value.trim() !== "", correct: () => numericMatches(inp.value, q.answer, tol), lock: v => (inp.disabled = v),
    mark: ok => { el.classList.remove("good", "bad"); el.classList.add(ok ? "good" : "bad"); },
    reveal: () => { inp.value = String(q.answer); el.classList.remove("bad"); el.classList.add("good"); },
    reset: () => { inp.value = ""; el.classList.remove("good", "bad"); } };
}
function qOrder(q, uid) {
  const n = q.items.length; let order = [...Array(n).keys()]; const rnd = rng(uid);
  const shuffle = () => { for (let k = 0; k < 6; k++) { for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; } if (order.some((v, i) => v !== i)) break; } };
  shuffle();
  const ul = h("ol", { class: "order-list" }); let locked = false;
  function draw() {
    ul.replaceChildren(...order.map((idx, pos) => h("li", null, h("span", { class: "txt", html: inline(q.items[idx]) }),
      h("button", { class: "btn ghost sm", type: "button", disabled: locked || pos === 0, "aria-label": "Move up", onclick: () => { [order[pos - 1], order[pos]] = [order[pos], order[pos - 1]]; draw(); } }, h("span",{class:"arr up"},icon("down"))),
      h("button", { class: "btn ghost sm", type: "button", disabled: locked || pos === n - 1, "aria-label": "Move down", onclick: () => { [order[pos + 1], order[pos]] = [order[pos], order[pos + 1]]; draw(); } }, icon("down")))));
  }
  draw();
  return { el: ul, answered: () => true, correct: () => order.every((v, i) => v === i), lock: v => { locked = v; draw(); },
    mark: ok => { ul.classList.remove("good", "bad"); ul.classList.add(ok ? "good" : "bad"); },
    reveal: () => { order = [...Array(n).keys()]; ul.classList.remove("bad"); ul.classList.add("good"); draw(); },
    reset: () => { order = [...Array(n).keys()]; shuffle(); ul.classList.remove("good", "bad"); draw(); } };
}

/* every practice block owns one live margin note; setLive() repaints it and the lesson record */
function liveNote(b, label) { b._live = note(label, h("div"), "open"); return b._live; }
function setLive(b, state, text) {
  if (!b._live) return;
  b._live.className = "mnote is-" + state;
  b._live.lastChild.replaceChildren(...[state === "done" ? icon("check") : null, document.createTextNode(text)].filter(Boolean));
  if (window.__drawRecord) window.__drawRecord();
}

function makeQuestion(q0, qi, quizId) {
  const q = q0.type === "truefalse" ? Object.assign({}, q0, { type: "single", options: ["True", "False"], answer: q0.answer ? 0 : 1 }) : q0;
  const uid = quizId + "-" + qi;
  const impl = q.type === "multi" ? qMulti(q, uid) : q.type === "fill" ? qFill(q, uid) : q.type === "numeric" ? qNumeric(q, uid) : q.type === "order" ? qOrder(q, uid) : qSingle(q, uid);
  const fb = h("div", { class: "q-feedback", role: "status" });
  const root = h("div", { class: "question" }, h("div", { class: "q-head" }, h("span", { class: "q-num" }, String(qi + 1)), h("div", { class: "q-text", html: md(q.q) })), q.code ? codeBlock({ code: q.code, lang: q.lang }) : null, impl.el);
  const hints = q.hints || (q.hint ? [q.hint] : []); let used = 0;
  const hintBox = h("div", { class: "hints" });
  let hintBtn = null;
  if (hints.length) {
    const label = () => { hintBtn.lastChild.textContent = hints.length > 1 ? "Hint " + used + "/" + hints.length : "Hint"; hintBtn.disabled = used >= hints.length; };
    hintBtn = h("button", { class: "btn ghost sm", type: "button", onclick: () => { hintBox.append(h("div", { class: "hint", html: inline(hints[used]) })); used++; label(); } }, icon("hint"), h("span"));
    label();
  }
  const actions = h("div", { class: "q-actions" });
  if (hintBtn) actions.append(hintBtn);
  const api = { el: root, impl, actions, answered: impl.answered };
  api.show = (ok, reveal) => {
    impl.mark(ok); if (reveal && !ok) impl.reveal();
    fb.replaceChildren(h("div", { class: "fb " + (ok ? "good" : "bad") }, h("strong", null, ok ? "Correct." : reveal ? "Not this time. The answer is shown above." : "Not quite. Try again."), (ok || reveal) && q.explanation ? h("div", { html: md(q.explanation) }) : !ok && q.hint ? h("div", { html: md("Hint: " + q.hint) }) : null));
  };
  api.clear = () => { fb.replaceChildren(); impl.reset(); impl.lock(false); };
  add(root, hintBox, actions, fb);
  return api;
}
function quizBlock(b, les) {
  const isTest = b.mode === "test" || les.kind === "test";
  const need = b.pass_score != null ? b.pass_score : 0.7;
  const st = P.quizzes[b.id] || (P.quizzes[b.id] = { attempts: 0, best: 0, correct: [], passed: false });
  const n = b.questions.length;
  const live = liveNote(b, isTest ? "Chapter test" : "Quiz");
  const paint = () => {
    if (isTest) setLive(b, st.passed ? "done" : st.attempts ? "miss" : "open", st.attempts ? "Best " + Math.round(st.best * 100) + "%" + (st.passed ? ", passed" : ", " + Math.round(need * 100) + "% to pass") : "Pass mark " + Math.round(need * 100) + "%, " + n + " questions");
    else setLive(b, st.correct.length === n ? "done" : "open", st.correct.length + " of " + n + " correct");
  };
  const root = h("section", { class: "block quiz" + (isTest ? " is-test" : ""), id: "b-" + b.id }, blockTitle(b.title || (isTest ? "Chapter test" : "Check your understanding"), isTest ? "flag" : null));
  if (b.intro) root.append(h("div", { class: "text", html: md(b.intro) }));
  if (isTest) root.append(h("p", { class: "note-small" }, "Answer every question, then submit. You need " + Math.round(need * 100) + "% to pass; you can retake it and your best score is kept."));
  const body = h("div"); root.append(body);
  let qs = [];
  function build() {
    qs = b.questions.map((q, i) => makeQuestion(q, i, b.id)); body.replaceChildren(...qs.map(x => x.el));
    if (!isTest) qs.forEach((x, i) => {
      const chk = h("button", { class: "btn sm", type: "button" }, "Check"), retry = h("button", { class: "btn ghost sm", type: "button", hidden: true }, "Try again"), rev = h("button", { class: "btn ghost sm", type: "button", hidden: true }, "Show answer");
      chk.onclick = () => {
        if (!x.answered()) { x.show(false); x.el.querySelector(".q-feedback").replaceChildren(h("div", { class: "fb" }, "Choose or type an answer first.")); return; }
        const ok = x.impl.correct(); st.attempts++;
        if (ok) { x.impl.lock(true); x.show(true); chk.disabled = true; retry.hidden = rev.hidden = true; if (st.correct.indexOf(i) < 0) st.correct.push(i); if (st.correct.length === n) logEvent("quiz", b.id, "Quiz complete: " + les.title); }
        else { x.show(false); retry.hidden = rev.hidden = false; }
        paint(); save();
      };
      retry.onclick = () => { x.clear(); chk.disabled = false; retry.hidden = rev.hidden = true; };
      rev.onclick = () => { x.impl.lock(true); x.show(false, true); chk.disabled = true; rev.hidden = true; retry.hidden = false; };
      x.actions.prepend(chk, retry, rev);
    });
  }
  build();
  if (isTest) {
    const res = h("div", { "aria-live": "polite" }), go = h("button", { class: "btn", type: "button" }, icon("flag"), "Submit the test"), again = h("button", { class: "btn ghost", type: "button", hidden: true }, icon("reset"), "Retake");
    const grade = () => {
      let right = 0; qs.forEach(x => { const ok = x.answered() && x.impl.correct(); if (ok) right++; x.impl.lock(true); x.show(ok, true); });
      const frac = right / qs.length; st.attempts++; st.best = Math.max(st.best, frac); st.last = frac; const pass = frac >= need;
      if (pass) { if (!st.passed) celebrate(); st.passed = true; P.lessons[les.id] = Object.assign(P.lessons[les.id] || {}, { completed: true, completedAt: new Date().toISOString() }); }
      logEvent("test", b.id, (pass ? "Passed" : "Took") + " the test for " + (CH_BY_ID[les.chapter] ? chLabel(CH_BY_ID[les.chapter]).name : les.title) + ": " + Math.round(frac * 100) + "%");
      res.replaceChildren(h("div", { class: "scorebar " + (pass ? "pass" : "fail") }, h("div", { class: "big" }, right + " of " + qs.length + " (" + Math.round(frac * 100) + "%)"), h("div", null, pass ? "Passed. The chapter is marked complete." : "Not passed yet. Read the explanations below, then retake it.")));
      go.hidden = true; again.hidden = false; paint(); save(); res.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "center" });
    };
    go.onclick = () => { const miss = qs.filter(x => !x.answered()).length; if (miss) ask(miss + " question" + (miss > 1 ? "s are" : " is") + " still unanswered. Submit anyway?", grade); else grade(); };
    again.onclick = () => { build(); res.replaceChildren(); go.hidden = false; again.hidden = true; };
    root.append(h("div", { class: "quiz-foot" }, go, again), res);
  }
  paint();
  return root;
}

/* ───────────── code editor (textarea with gutter; Tab indents, Ctrl/Cmd+Enter runs) ───────────── */
function codeEditor(initial, onRun, opts) {
  const ta = h("textarea", { class: "ed-ta", spellcheck: "false", autocomplete: "off", autocapitalize: "off", "aria-label": (opts && opts.label) || "Code editor", wrap: "off" });
  ta.value = initial || "";
  const gutter = h("div", { class: "ed-gutter", "aria-hidden": "true" });
  const paintGutter = () => { const n = ta.value.split("\n").length; if (gutter.childElementCount !== n) gutter.replaceChildren(...Array.from({ length: n }, (_, i) => h("span", null, String(i + 1)))); };
  ta.addEventListener("input", () => { paintGutter(); if (opts && opts.onChange) opts.onChange(ta.value); });
  ta.addEventListener("scroll", () => { gutter.scrollTop = ta.scrollTop; });
  let tabFree = false;
  ta.addEventListener("blur", () => { tabFree = false; });
  ta.addEventListener("keydown", e => {
    if (e.key === "Escape") { tabFree = true; return; }
    if (e.key === "Tab" && tabFree) return;
    tabFree = false;
    if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); const s = ta.selectionStart, en = ta.selectionEnd; ta.setRangeText("    ", s, en, "end"); ta.dispatchEvent(new Event("input")); }
    else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); if (onRun) onRun(); }
    else if (e.key === "Enter") { const s = ta.selectionStart; const line = ta.value.slice(ta.value.lastIndexOf("\n", s - 1) + 1, s); let ind = (/^\s*/.exec(line) || [""])[0]; if (/:\s*$/.test(line)) ind += "    "; e.preventDefault(); ta.setRangeText("\n" + ind, s, ta.selectionEnd, "end"); ta.dispatchEvent(new Event("input")); }
  });
  paintGutter();
  const lines = Math.min(Math.max((initial || "").split("\n").length + 1, (opts && opts.minLines) || 8), (opts && opts.maxLines) || 26);
  ta.setAttribute("aria-describedby", "ed-help"); if (!document.getElementById("ed-help")) document.body.append(h("p", { id: "ed-help", hidden: true }, "Tab indents. Press Escape, then Tab, to leave the editor. Ctrl+Enter runs."));
  const el = h("div", { class: "editor", style: "--ed-lines:" + lines }, gutter, ta);
  return { el, get value() { return ta.value; }, set value(v) { ta.value = v; paintGutter(); }, focus: () => ta.focus() };
}

/* ───────────── running Python: local helper first, Pyodide when vendored ───────────── */
let pyodideP = null;
function loadPyodide_() {
  if (pyodideP) return pyodideP;
  pyodideP = new Promise((res, rej) => {
    const s = document.createElement("script"); s.src = "assets/vendor/pyodide/pyodide.js";
    s.onload = () => window.loadPyodide({ indexURL: "assets/vendor/pyodide/" }).then(res, rej);
    s.onerror = () => { pyodideP = null; rej(new Error("no-pyodide")); };
    document.head.append(s);
  });
  return pyodideP;
}
async function runPython(code) {
  if (serverMode) {
    const r = await fetch("api/run-python", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
    const j = await r.json(); if (!r.ok) throw new Error(j.error || "The course helper refused to run the code.");
    return { ok: j.ok, output: j.output || "", timedOut: j.timed_out, where: "python3 on this computer" };
  }
  let py;
  try { py = await loadPyodide_(); } catch (e) {
    throw new Error("Running code needs the course helper. Start the course with ./start.sh (or start.bat) and reload this page.");
  }
  let out = "";
  py.setStdout({ batched: s => { out += s + "\n"; } }); py.setStderr({ batched: s => { out += s + "\n"; } });
  try { await py.loadPackagesFromImports(code); } catch (e) { /* offline: imports fail loudly below */ }
  try { await py.runPythonAsync(code); return { ok: true, output: out, where: "Python in the browser" }; }
  catch (e) { return { ok: false, output: out + String(e.message || e), where: "Python in the browser" }; }
}

/* ───────────── playground block: edit, run, check ───────────── */
function playgroundBlock(b, les) {
  const st = P.playgrounds[b.id] || (P.playgrounds[b.id] = { status: "todo", runs: 0 });
  const DKEY = "course-draft:" + b.id; let draft = null; try { draft = localStorage.getItem(DKEY); } catch (e) { /* ignore */ }
  liveNote(b, "Playground");
  const paint = () => setLive(b, st.status === "passed" ? "done" : st.status === "failed" ? "miss" : "open", st.status === "passed" ? "Check passed" : st.status === "failed" ? "Check not passing yet" : b.check ? "Run it, then pass the check" : "Run it and experiment");
  const out = h("pre", { class: "term", hidden: true, "aria-live": "polite" }), status = h("div", { class: "run-status" });
  const ed = codeEditor(draft || b.code, () => run(!!b.check), { label: b.title || "Python playground", onChange: v => { try { localStorage.setItem(DKEY, v); } catch (e) { /* ignore */ } } });
  async function run(withCheck) {
    status.className = "run-status"; status.textContent = "Running…"; runBtn.disabled = chkBtn && (chkBtn.disabled = true);
    const code = ed.value + (withCheck && b.check ? "\n\n# ---- check ----\n" + b.check + "\nprint('\\nAll checks passed.')\n" : "");
    try {
      const r = await runPython(code); st.runs++;
      out.hidden = false; out.textContent = r.output.trim() || "(no output)";
      if (withCheck) {
        st.status = r.ok ? "passed" : "failed";
        if (r.ok) { celebrate(); logEvent("playground", b.id, "Playground solved: " + (b.title || les.title)); }
      }
      status.className = "run-status " + (r.ok ? "good" : "bad");
      status.textContent = r.timedOut ? "Stopped: it ran longer than the time limit." : r.ok ? (withCheck ? "Check passed." : "Ran without errors") + " (" + r.where + ")" : (withCheck ? "The check failed: read the last lines of the output." : "The code raised an error: the last line of the output says which.");
      paint(); save();
    } catch (e) { status.className = "run-status bad"; status.textContent = e.message; }
    runBtn.disabled = false; if (chkBtn) chkBtn.disabled = false;
  }
  const runBtn = h("button", { class: "btn", type: "button", onclick: () => run(false) }, icon("play"), "Run");
  const chkBtn = b.check ? h("button", { class: "btn ghost", type: "button", onclick: () => run(true) }, icon("check"), "Run and check") : null;
  const resetBtn = h("button", { class: "btn ghost sm", type: "button", onclick: () => ask("Replace your code with the starting code?", () => { ed.value = b.code; try { localStorage.removeItem(DKEY); } catch (e) { /* ignore */ } }) }, icon("reset"), "Start over");
  const extras = h("div", { class: "row" });
  if (b.hint) { const hb = h("button", { class: "btn ghost sm", type: "button", onclick: () => { extras.after(h("div", { class: "hint", html: md(b.hint) })); hb.disabled = true; } }, icon("hint"), "Hint"); extras.append(hb); }
  if (b.solution) { const sb = h("button", { class: "btn ghost sm", type: "button", onclick: () => ask("Show a worked solution? Trying first is how this sticks.", () => { extras.after(codeBlock({ code: b.solution, lang: "python", file: "solution.py" })); sb.disabled = true; }) }, icon("eye"), "Solution"); extras.append(sb); }
  extras.append(resetBtn);
  paint();
  return h("section", { class: "block playground", id: "b-" + b.id }, blockTitle(b.title || "Try it in Python", "flask"), b.md ? h("div", { class: "text", html: md(b.md) }) : null, ed.el,
    h("div", { class: "row" }, runBtn, chkBtn, h("span", { class: "kbd-hint" }, "Ctrl+Enter runs")), status, out, extras);
}

/* ───────────── calculator widget block (definitions in assets/widgets.js) ───────────── */
function widgetBlock(b, les) {
  const W = window.WIDGETS && window.WIDGETS[b.widget];
  if (!W) return h("div", { class: "block" }, "Calculator '" + b.widget + "' is missing from assets/widgets.js.");
  const root = h("section", { class: "block widget", id: "b-" + b.id }, blockTitle(b.title || W.title, "calc"));
  if (b.md) root.append(h("div", { class: "text", html: md(b.md) }));
  root.append(W.mount(Object.assign({}, W.defaults, b.params || {}), { h, icon, inline, tex2mml }));
  if (b.challenge) {
    const c = b.challenge, st = P.widgets[b.id] || (P.widgets[b.id] = { status: "todo", tries: 0 });
    liveNote(b, "Calculator task");
    const paint = () => setLive(b, st.status === "passed" ? "done" : "open", st.status === "passed" ? "Solved" : "Use the calculator, then answer");
    const inp = h("input", { type: "text", inputmode: "decimal", placeholder: "Your answer", "aria-label": "Your answer" });
    const fb = h("div", { class: "q-feedback", role: "status" });
    const go = () => {
      if (!inp.value.trim()) return; st.tries++;
      const ok = numericMatches(inp.value, c.answer, Math.abs(c.tolerance || 0));
      if (ok) { st.status = "passed"; logEvent("widget", b.id, "Calculator task solved: " + (b.title || W.title)); }
      fb.replaceChildren(h("div", { class: "fb " + (ok ? "good" : "bad") }, h("strong", null, ok ? "Correct." : "Not quite."), ok && c.explanation ? h("div", { html: md(c.explanation) }) : !ok && c.hint ? h("div", { html: md(c.hint) }) : null));
      paint(); save();
    };
    inp.addEventListener("keydown", e => { if (e.key === "Enter") go(); });
    root.append(h("div", { class: "challenge" }, h("div", { class: "q-text", html: md(c.md) }), h("div", { class: "fill-in" }, inp, c.unit ? h("span", { class: "unit" }, c.unit) : null, h("button", { class: "btn sm", type: "button", onclick: go }, "Check")), fb));
    paint();
  }
  return root;
}

/* ───────────── exercises: in-page editor + local test run ───────────── */
function parseUnittest(out) {
  const res = []; const re = /^(test_\w+) \([^)]*\)[^\n]*?\.\.\. (ok|FAIL|ERROR|skipped)/gm; let m;
  while ((m = re.exec(out))) res.push({ name: m[1].replace(/^test_unit_|^test_/, "").replace(/_/g, " "), ok: m[2] === "ok" });
  return res;
}
function exerciseBlock(b, les) {
  const st = P.exercises[b.id] || (P.exercises[b.id] = { status: "todo", attempts: 0, hints: 0, checked: [] });
  const tests = b.mode === "tests";
  liveNote(b, "Build exercise");
  const paint = () => setLive(b, st.status === "passed" ? "done" : st.status === "failed" ? "miss" : "open", st.status === "passed" ? "All tests pass" : st.status === "failed" ? (st.lastPassed != null ? st.lastPassed + " of " + st.lastTotal + " tests pass" : "Tests failing") : tests ? "Not run yet" : "To do");
  const mark = s => { const was = st.status; st.status = s; if (s === "passed" && was !== "passed") { celebrate(); logEvent("exercise", b.id, "Exercise passed: " + b.title); } paint(); save(); };
  const root = h("section", { class: "block exercise", id: "b-" + b.id }, blockTitle(b.title, "hammer", b.difficulty ? h("span", { class: "tag" }, b.difficulty) : null));
  root.append(h("div", { class: "text", html: md(b.goal) }));
  if (b.behavior) root.append(h("h4", null, "What it must do"), h("div", { class: "text", html: md(b.behavior) }));
  if (b.examples && b.examples.length) root.append(h("div", { class: "tablewrap" }, h("table", null, h("thead", null, h("tr", null, h("th", null, "Input"), h("th", null, "Expected"))), h("tbody", null, b.examples.map(e => h("tr", null, h("td", null, h("code", null, e.input == null ? "" : String(e.input))), h("td", null, h("code", null, e.output == null ? "" : String(e.output)))))))));
  const out = h("pre", { class: "term", hidden: true }), runStatus = h("div", { class: "run-status", "aria-live": "polite" }), board = h("ul", { class: "testboard" });
  const actions = h("div", { class: "row" });
  if (tests) {
    const f = b.files || {}, starter = (f.starter || [])[0];
    const DKEY = "course-draft:" + b.id; let draft = null; try { draft = localStorage.getItem(DKEY); } catch (e) { /* ignore */ }
    const where = "exercises/" + b.dir + "/";
    root.append(h("h4", null, "Your file: ", h("code", null, where + (starter ? starter.path : ""))));
    let ed = null;
    if (starter) {
      ed = codeEditor(draft || starter.content, () => runTests(), { label: starter.path, maxLines: 30, onChange: v => { try { localStorage.setItem(DKEY, v); } catch (e) { /* ignore */ } } });
      const todos = (starter.content.match(/# TODO\(\d+\)/g) || []).length;
      root.append(h("p", { class: "note-small" }, todos ? "Search the file for TODO: " + todos + " place" + (todos > 1 ? "s" : "") + " to fill in. Your edits are kept in this browser; Save writes them to the exercise folder." : "Edit the file, then run the tests."), ed.el);
    }
    async function saveFile() {
      const r = await fetch("api/save-exercise", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dir: b.dir, path: starter.path, content: ed.value }) });
      const j = await r.json(); if (!r.ok || !j.ok) throw new Error(j.error || "could not save the file");
    }
    async function runTests() {
      if (!serverMode) { runStatus.className = "run-status bad"; runStatus.textContent = "Tests run through the course helper. Start the course with ./start.sh, or run the command below in a terminal."; return; }
      runBtn.disabled = true; runStatus.className = "run-status"; runStatus.textContent = "Saving and running the tests…"; st.attempts++;
      try {
        if (ed) await saveFile();
        const r = await fetch("api/run-tests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dir: b.dir }) });
        const j = await r.json(); if (!r.ok) throw new Error(j.error || "error");
        const parsed = parseUnittest(j.output || "");
        st.lastPassed = parsed.filter(x => x.ok).length; st.lastTotal = parsed.length;
        board.replaceChildren(...parsed.map(x => h("li", { class: x.ok ? "ok" : "bad" }, icon(x.ok ? "check" : "x"), x.name)));
        runStatus.className = "run-status " + (j.ok ? "good" : "bad");
        runStatus.textContent = j.timed_out ? "Stopped: the tests ran longer than the time limit." : j.ok ? "All " + parsed.length + " tests pass." : (parsed.length ? st.lastPassed + " of " + parsed.length + " tests pass. The first failure is at the top of the output." : "The tests did not run: read the output.");
        out.hidden = false; out.textContent = j.output || "";
        mark(j.ok ? "passed" : "failed");
      } catch (e) { runStatus.className = "run-status bad"; runStatus.textContent = "The course helper did not answer: " + (e.message || ""); }
      runBtn.disabled = false;
    }
    const runBtn = h("button", { class: "btn primary", type: "button", onclick: runTests }, icon("play"), "Save and run tests");
    actions.append(runBtn);
    if (ed) actions.append(h("button", { class: "btn ghost sm", type: "button", onclick: () => ask("Replace your code with the starting file?", () => { ed.value = starter.content; try { localStorage.removeItem(DKEY); } catch (e) { /* ignore */ } }) }, icon("reset"), "Start over"));
    const cmd = "cd " + where + " && " + (b.command_display || "");
    const copy = h("button", { class: "btn ghost sm", type: "button", onclick: () => copyText(cmd, copy) }, "Copy");
    root.append(h("details", { class: "fold" }, h("summary", null, "Run it from a terminal instead"), h("div", { class: "cmdline" }, h("code", null, cmd), copy)));
    if (f.tests && f.tests.length) root.append(h("details", { class: "fold" }, h("summary", null, "Read the tests"), f.tests.map(x => codeBlock({ code: x.content, file: x.path, lang: langOf(x.path) }))));
  } else {
    if (b.checklist && b.checklist.length) root.append(h("h4", null, "Check your work"), h("ul", { class: "checklist" }, b.checklist.map((c, i) => h("li", null, h("label", null,
      h("input", Object.assign({ type: "checkbox", onchange: e => { const k = st.checked.indexOf(i); if (e.target.checked && k < 0) st.checked.push(i); if (!e.target.checked && k >= 0) st.checked.splice(k, 1); save(); } }, st.checked.indexOf(i) >= 0 ? { checked: true } : {})), h("span", { html: inline(c) }))))));
    const doneBtn = h("button", { class: "btn", type: "button", onclick: () => { mark(st.status === "passed" ? "todo" : "passed"); doneBtn.lastChild.textContent = st.status === "passed" ? "Mark as not done" : "Mark as done"; } }, icon("check"), h("span", null, st.status === "passed" ? "Mark as not done" : "Mark as done"));
    actions.append(doneBtn);
  }
  const hints = b.hints || []; const hintBox = h("div", { class: "hints" });
  for (let i = 0; i < Math.min(st.hints || 0, hints.length); i++) hintBox.append(h("div", { class: "hint", html: inline(hints[i]) }));
  if (hints.length) {
    const hb = h("button", { class: "btn ghost sm", type: "button", onclick: () => { hintBox.append(h("div", { class: "hint", html: inline(hints[st.hints]) })); st.hints++; lab(); save(); } }, icon("hint"), h("span"));
    const lab = () => { hb.lastChild.textContent = "Hint " + st.hints + "/" + hints.length; hb.disabled = st.hints >= hints.length; }; lab(); actions.append(hb);
  }
  const solBox = h("div");
  const sol = tests ? ((b.files && b.files.solution) || []) : (typeof b.solution === "string" ? [{ path: b.solution_file || "", content: b.solution, lang: b.solution_lang || b.language }] : (b.solution || []));
  if (sol.length || b.solution_explain) {
    const sb = h("button", { class: "btn ghost sm", type: "button" }, icon("eye"), h("span", null, "Solution"));
    sb.onclick = () => {
      if (solBox.childNodes.length) { solBox.replaceChildren(); sb.lastChild.textContent = "Solution"; return; }
      ask("Show the reference solution? Working through a failing test teaches more.", () => { fill(solBox, h("h4", null, "Reference solution"), sol.map(x => codeBlock({ code: x.content, file: x.path, lang: x.lang || langOf(x.path) })), b.solution_explain ? h("div", { class: "text", html: md(b.solution_explain) }) : null); sb.lastChild.textContent = "Hide solution"; });
    };
    actions.append(sb);
  }
  root.append(actions, runStatus, board, out, hintBox, solBox);
  paint();
  return root;
}

/* ───────────── flashcards ───────────── */
function flashBlock(b) {
  const st = P.cards[b.id] || (P.cards[b.id] = { known: [] });
  let queue = b.cards.map((_, i) => i).filter(i => st.known.indexOf(i) < 0), flipped = false;
  liveNote(b, "Flashcards");
  const paint = () => setLive(b, st.known.length >= b.cards.length ? "done" : "open", st.known.length + " of " + b.cards.length + " known");
  const meta = h("div", { class: "note-small" }), stage = h("div", { class: "flash-stage" }), ctr = h("div", { class: "row" });
  function draw() {
    stage.replaceChildren(); ctr.replaceChildren(); flipped = false; paint();
    if (!queue.length) { stage.append(h("div", { class: "scorebar pass" }, h("div", { class: "big" }, "You know every card in this set."))); ctr.append(h("button", { class: "btn ghost sm", type: "button", onclick: () => { st.known = []; queue = b.cards.map((_, i) => i); save(); draw(); } }, icon("reset"), "Study again")); meta.textContent = ""; return; }
    const c = b.cards[queue[0]];
    const card = h("button", { class: "card", type: "button", "aria-label": "Flip the card", onclick: () => { flipped = !flipped; card.classList.toggle("flipped", flipped); } }, h("div", { class: "face front", html: inline(c.front) }), h("div", { class: "face back", html: inline(c.back) }));
    stage.append(card); meta.textContent = queue.length + " left. Click the card to flip it.";
    ctr.append(h("button", { class: "btn sm", type: "button", onclick: () => { st.known.push(queue.shift()); save(); draw(); } }, icon("check"), "I knew it"), h("button", { class: "btn ghost sm", type: "button", onclick: () => { queue.push(queue.shift()); draw(); } }, "Not yet"));
  }
  const root = h("div", { class: "block flash", id: "b-" + b.id }, blockTitle(b.title || "Flashcards", "cards"), meta, stage, ctr); draw(); return root;
}

/* ───────────── pages ───────────── */
const content = () => $("#content");
let currentRoute = { kind: "home" };
const LAYER = {
  deep: ["Deep", "Hand-written lessons with walkthroughs, calculators and playgrounds"],
  lab: ["Lab", "A hand-written hands-on lab: a worked example, a calculator task, a Python playground and a numeric quiz"],
  "has-lab": ["Has a lab", "Lessons built from the book, plus one or more hand-written hands-on labs"],
  imported: ["Imported", "Lessons built from the book's own text, quiz bank and concept map"],
};
const lessonLayer = (id, les, ch) => les && les.kind === "test" ? null : id.indexOf("-lab-") > 0 ? "lab" : ch.layer === "deep" ? "deep" : "imported";
const chapterTag = ch => tagEl(ch.layer === "lab" ? "has-lab" : ch.layer);
const tagEl = layer => { const L = LAYER[layer] || LAYER.imported; return h("span", { class: "depth is-" + (LAYER[layer] ? layer : "imported"), title: L[1] }, L[0]); };
function bar(frac, state) { return h("div", { class: "hbar" + (state ? " is-" + state : "") }, h("div", { class: "hbar-fill", style: "width:" + Math.round(100 * Math.min(1, frac)) + "%" })); }
function chapterRecord(ch) {
  const done = chDone(ch), n = ch.stubs.length, tq = testOf(ch), ts = tq && P.quizzes[tq], ex = exOf(ch);
  const exPassed = ex.filter(id => P.exercises[id] && P.exercises[id].status === "passed").length;
  return [
    note("Lessons", h("div", null, h("div", { class: "mnum" }, done + " / " + n), bar(done / n, done === n ? "done" : done ? "open" : "")), done === n ? "done" : null),
    tq ? note("Chapter test", h("div", null, ts && ts.attempts ? (ts.passed ? "Passed, best " : "Best ") + Math.round(ts.best * 100) + "%" : "Not taken"), ts && ts.passed ? "done" : ts && ts.attempts ? "miss" : null) : null,
    ex.length ? note("Build", h("div", null, exPassed + " of " + ex.length + " exercise" + (ex.length > 1 ? "s" : "") + " passing"), exPassed === ex.length ? "done" : null) : null,
  ];
}
function renderHome() {
  const el = content(); const nid = nextLessonId(); const pct = overallPct();
  const doneN = ORDER.filter(lessonDone).length;
  const tests = C.chapters.map(testOf).filter(Boolean), testsPassed = tests.filter(id => P.quizzes[id] && P.quizzes[id].passed).length;
  const exAll = [].concat(...C.chapters.map(exOf)), exPassed = exAll.filter(id => P.exercises[id] && P.exercises[id].status === "passed").length;
  const lastLog = (P.log || []).slice().reverse().find(e => e.kind !== "visit") || (P.log || [])[P.log.length - 1];
  const resume = nid ? h("div", { class: "resume" },
    h("p", null, P.last ? "Pick up where you left off: " : "Start at the beginning: ", h("strong", null, STUB[nid].title), ", in ", h("a", { href: "#/ch/" + C.chapters[CH_OF[nid]].id }, chLabel(C.chapters[CH_OF[nid]]).name), "."),
    h("a", { class: "btn primary", href: "#/lesson/" + nid }, P.last ? "Continue" : "Start the course", icon("arrow"))) : h("p", { class: "resume" }, h("strong", null, "Every lesson is complete."));
  const frag = [row([h("h1", { class: "display" }, "Machine Learning Systems"),
    h("p", { class: "lead" }, "One course through all four volumes of the MLSysBook and the TinyTorch build-it-yourself framework: read a lesson, run the numbers in a calculator or a Python playground, then prove it with a quiz, a unit test or a chapter test."),
    resume], [
    note("Your record", h("div", null, h("div", { class: "mnum big" }, pct + "%"), bar(pct / 100, pct === 100 ? "done" : "open"), h("div", { class: "note-small" }, fmtInt(doneN) + " of " + fmtInt(ORDER.length) + " lessons"))),
    note("Chapter tests", h("div", null, testsPassed + " of " + tests.length + " passed")),
    note("TinyTorch builds", h("div", null, exPassed + " of " + exAll.length + " passing")),
    lastLog ? note("Last session", h("div", null, h("a", { href: "#/log" }, new Date(lastLog.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) + ": " + lastLog.text))) : note("Progress", h("div", null, serverMode ? "Saved to progress/progress.json as you go." : "Saved in this browser. Start with ./start.sh to keep it in a file.")),
  ], "masthead")];
  (C.parts || []).forEach(p => {
    const chs = C.chapters.filter(c => c.part === p.id); if (!chs.length) return;
    const pd = chs.reduce((a, c) => a + chDone(c), 0), pn = chs.reduce((a, c) => a + c.stubs.length, 0);
    frag.push(row([h("h2", { class: "part-title", id: "part-" + p.id }, p.label + ": " + p.title)], [note(null, h("div", null, h("div", { class: "mnum" }, pd + " / " + fmtInt(pn) + " lessons"), bar(pn ? pd / pn : 0, pd === pn ? "done" : pd ? "open" : "")))], "part-head"));
    chs.forEach(ch => {
      const lab = chLabel(ch), isNext = nid && C.chapters[CH_OF[nid]] === ch;
      frag.push(row(h("a", { class: "chrow-link" + (isNext ? " is-current" : ""), href: "#/ch/" + ch.id },
        h("span", { class: "ch-tag" }, lab.tag.replace("TinyTorch", "TT")), h("span", { class: "ch-name" }, lab.name), chapterTag(ch), ch.summary ? h("span", { class: "ch-sum", html: inline(ch.summary.replace(/^Vol [IV]+:\s*/, "")) }) : null),
        chapterRecord(ch), "chrow"));
    });
  });
  fill(el, h("div", { class: "page home" }, frag));
}
async function renderChapter(id) {
  const ch = CH_BY_ID[id]; const el = content();
  if (!ch) return renderMissing();
  const lab = chLabel(ch), firstOpen = ch.stubs.find(s => !lessonDone(s.id)) || ch.stubs[0];
  const frag = [row([h("div", { class: "crumb" }, h("a", { href: "#/home" }, "Contents"), " / ", lab.tag), h("h1", { class: "headline" }, lab.name), ch.summary ? h("p", { class: "lead", html: inline(ch.summary) }) : null,
    ch.goals && ch.goals.length ? h("div", { class: "goals" }, h("h2", null, "Key ideas"), h("ul", null, ch.goals.map(g => h("li", { html: inline(g) })))) : null,
    h("div", { class: "row" }, h("a", { class: "btn primary", href: "#/lesson/" + firstOpen.id }, chDone(ch) ? "Continue the chapter" : "Start the chapter", icon("arrow")), chapterTag(ch))],
    chapterRecord(ch), "masthead")];
  ch.stubs.forEach((s, i) => {
    const pr = [];
    s.quizzes.forEach(q => { const st = P.quizzes[q.id]; pr.push(q.test ? (st && st.attempts ? "test " + Math.round(st.best * 100) + "%" : "test") : "quiz " + (st ? st.correct.length : 0) + "/" + q.n); });
    if (s.exercises.length) pr.push("build");
    if (s.playgrounds.length) pr.push(s.playgrounds.length + " playground" + (s.playgrounds.length > 1 ? "s" : ""));
    if (s.widgets.length) pr.push("calculator task");
    const state = lessonDone(s.id) ? "done" : lessonStarted(s.id) ? "open" : null;
    frag.push(row(h("a", { class: "lrow-link" + (P.last === s.id ? " is-current" : ""), href: "#/lesson/" + s.id }, h("span", { class: "l-num" }, s.kind === "test" ? "T" : String(i)), h("span", { class: "l-title" }, s.title), s.summary ? h("span", { class: "l-sum", html: inline(s.summary) }) : null),
      [note(null, h("div", null, state === "done" ? icon("check") : null, (state === "done" ? "Done" : state === "open" ? "Started" : "Not started") + " · " + s.minutes + " min" + (pr.length ? " · " + pr.join(", ") : "")), state)], "lrow"));
  });
  fill(el, h("div", { class: "page chapter" }, frag));
}
function recordItems(les) {
  return (les.blocks || []).filter(b => b._live).map(b => {
    const state = (b._live.className.match(/is-(\w+)/) || [])[1] || "open";
    return h("li", { class: "is-" + state }, h("a", { href: "#b-" + b.id, onclick: e => { e.preventDefault(); const t = document.getElementById("b-" + b.id); if (t) t.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "start" }); } },
      icon(state === "done" ? "check" : b.type === "quiz" ? (les.kind === "test" ? "flag" : "search") : b.type === "exercise" ? "hammer" : b.type === "playground" ? "flask" : b.type === "widget" ? "calc" : "cards"),
      h("span", null, b._live.firstChild.textContent + ": " + b._live.lastChild.textContent)));
  });
}
function lessonPosLabel(ch, id) {
  const body = ch.stubs.filter(s => s.kind !== "test" && !/-00-overview$/.test(s.id));
  const i = body.findIndex(s => s.id === id);
  return i < 0 ? "Chapter overview" : "Lesson " + (i + 1) + " of " + body.length;
}
async function renderLesson(id) {
  const el = content(); const stub = STUB[id];
  if (!stub) return renderMissing();
  const ch = C.chapters[CH_OF[id]];
  el.replaceChildren(h("div", { class: "page" }, h("div", { class: "skeleton-col" }, h("div", { class: "sk" }), h("div", { class: "sk" }), h("div", { class: "sk short" }))));
  let lessons;
  try { lessons = await loadChapter(ch.id); } catch (e) { fill(el, h("div", { class: "page" }, h("h1", null, "This chapter could not be loaded"), h("p", null, e.message + ". Rebuild the course with mlsys-course-tools/build.py, then reload."))); return; }
  if (currentRoute.arg !== id) return;
  const les = lessons[id]; const lab = chLabel(ch); const pos = ORDER.indexOf(id);
  P.last = id; const lp = (P.lessons[id] = P.lessons[id] || {}); if (!lp.visited) { lp.visited = new Date().toISOString(); logEvent("visit", id, "Visited " + les.title + " (" + lab.name + ")"); } save();
  termsSeen.clear(); calcSeen.clear();
  const isTest = les.kind === "test";
  const record = h("ol", { class: "record" });
  const finish = h("div", { class: "finish" });
  const drawFinish = () => {
    finish.replaceChildren();
    if (isTest) { finish.append(h("p", null, lessonDone(id) ? "Test passed: this chapter is complete." : "Pass the test to complete the chapter.")); }
    else if (!lessonDone(id)) finish.append(h("button", { class: "btn primary", type: "button", onclick: () => { P.lessons[id] = Object.assign(P.lessons[id] || {}, { completed: true, completedAt: new Date().toISOString() }); logEvent("lesson", id, "Completed " + les.title + " (" + lab.name + ")"); celebrate(); save(true); drawFinish(); } }, icon("check"), "Mark this lesson complete"));
    else finish.append(h("p", { class: "done-line" }, icon("check"), "Lesson complete."));
    const nxt = pos < ORDER.length - 1 ? ORDER[pos + 1] : null;
    if (nxt && (lessonDone(id) || isTest)) finish.append(h("a", { class: "btn" + (lessonDone(id) ? " primary" : ""), href: "#/lesson/" + nxt }, "Next: " + STUB[nxt].title, icon("arrow")));
  };
  window.__drawRecord = () => {
    const items = recordItems(les); record.replaceChildren(...items);
    const open = items.filter(li => !li.classList.contains("is-done")).length;
    recNote.className = "mnote record-note" + (items.length && !open ? " is-done" : "");
    recLabel.textContent = items.length ? (open ? open + " of " + items.length + " still open" : "All practice done") : "Reading lesson";
    if (items.length && !open && !isTest && !lessonDone(id)) {
      P.lessons[id] = Object.assign(P.lessons[id] || {}, { completed: true, completedAt: new Date().toISOString(), auto: true });
      logEvent("lesson", id, "Completed " + les.title + " (" + lab.name + "): all practice done"); celebrate(); save(true); drawFinish();
    }
  };
  const recLabel = h("div", { class: "mlabel" }), recNote = h("div", { class: "mnote record-note" }, recLabel, record);
  const rows = [row([h("div", { class: "crumb" }, h("a", { href: "#/home" }, "Contents"), " / ", h("a", { href: "#/ch/" + ch.id }, lab.tag + " · " + lab.name)),
    h("h1", { class: "headline" }, les.title), les.summary ? h("p", { class: "lead", html: inline(les.summary) }) : null,
    h("div", { class: "meta" }, h("span", null, (les.minutes || 10) + " min"), h("span", null, isTest ? "Chapter test" : lessonPosLabel(ch, id)), (lessonLayer(id, les, ch) ? tagEl(lessonLayer(id, les, ch)) : null), lessonDone(id) ? h("span", { class: "is-done" }, icon("check"), "Complete") : null)],
    [recNote], "masthead")];
  (les.blocks || []).forEach(b => {
    const main = renderBlock(b, les);
    rows.push(row(main, sideFor(b, les, b._live), "b-" + b.type));
  });
  if (les.terms && les.terms.length) rows.push(row(h("div", { class: "block terms" }, h("h2", { class: "block-title" }, "Terms from this lesson"), h("dl", null, les.terms.map(x => [h("dt", null, x.term), h("dd", { html: inline(x.def) })]))), []));
  rows.push(row(finish, []));
  const prev = pos > 0 ? ORDER[pos - 1] : null, nxt = pos < ORDER.length - 1 ? ORDER[pos + 1] : null;
  rows.push(row(h("nav", { class: "pager", "aria-label": "Lesson navigation" }, prev ? h("a", { href: "#/lesson/" + prev }, h("small", null, "Previous"), STUB[prev].title) : h("span"), nxt ? h("a", { class: "nx", href: "#/lesson/" + nxt }, h("small", null, "Next"), STUB[nxt].title) : null), [note("Keys", h("div", null, h("kbd", null, "["), " and ", h("kbd", null, "]"), " move between lessons."))]));
  fill(el, h("article", { class: "page lesson" }, rows));
  drawFinish(); window.__drawRecord();
  if (location.hash.indexOf("#b-") > 0) { /* deep link to a block is not used by the router */ }
}
function renderLog() {
  const el = content(); const log = (P.log || []).slice().reverse();
  const byDay = {}; log.forEach(e => { const d = e.at.slice(0, 10); (byDay[d] = byDay[d] || []).push(e); });
  const days = Object.keys(byDay);
  const doneN = ORDER.filter(lessonDone).length;
  const exp = h("button", { class: "btn ghost sm", type: "button", onclick: () => {
    const blob = new Blob([JSON.stringify(P, null, 2)], { type: "application/json" }); const a = h("a", { href: URL.createObjectURL(blob), download: "mlsys-course-progress-" + new Date().toISOString().slice(0, 10) + ".json" }); document.body.append(a); a.click(); a.remove();
  } }, icon("save"), "Export progress");
  const file = h("input", { type: "file", accept: "application/json", hidden: true, onchange: e => {
    const f = e.target.files[0]; if (!f) return; f.text().then(txt => { const j = JSON.parse(txt); if (!j || typeof j !== "object" || !j.lessons) throw new Error(); ask("Replace your current progress with this file?", () => { P = Object.assign(BLANK(), j); save(true); route(); }); }).catch(() => ask("That file is not a progress export from this course.", () => {}));
  } });
  const imp = h("button", { class: "btn ghost sm", type: "button", onclick: () => file.click() }, "Import progress");
  const rows = [row([h("h1", { class: "headline" }, "Logbook"), h("p", { class: "lead" }, "Your work, newest first: lessons completed, quizzes and tests scored, calculator tasks and exercises solved, and the lessons you visited. It is saved with your progress; export it to move it to another computer."), h("div", { class: "row" }, exp, imp, file)],
    [note("Lessons", h("div", { class: "mnum" }, fmtInt(doneN) + " / " + fmtInt(ORDER.length))), note("Days with activity", h("div", { class: "mnum" }, String(days.length))), note("Entries", h("div", { class: "mnum" }, fmtInt(log.length)))], "masthead")];
  if (!log.length) rows.push(row(h("div", { class: "empty" }, h("p", null, "Nothing logged yet. Every lesson you complete, quiz you finish, test you take and exercise you pass is written here with its date."), h("a", { class: "btn primary", href: "#/lesson/" + nextLessonId() }, "Open your next lesson", icon("arrow"))), []));
  days.forEach(d => rows.push(row([h("h2", { class: "day" }, new Date(d + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })),
    h("ul", { class: "loglist" }, byDay[d].map(e => h("li", { class: "k-" + e.kind }, h("time", null, new Date(e.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })), h("span", null, e.ref && STUB[e.ref] ? h("a", { href: "#/lesson/" + e.ref }, e.text) : e.text))))], [note(null, h("div", null, byDay[d].length + " entr" + (byDay[d].length > 1 ? "ies" : "y")))])));
  fill(el, h("div", { class: "page log" }, rows));
}
function renderPlayground() {
  const el = content(); const KEY = "course-scratch";
  let saved = null; try { saved = localStorage.getItem(KEY); } catch (e) { /* ignore */ }
  const start = "# Scratchpad: anything you type here is kept in this browser.\n# Ctrl+Enter runs it, with the python3 on your computer.\nimport math\n\nparams = 7e9          # a 7B-parameter model\nbytes_per_param = 2   # fp16\nprint(f\"weights: {params * bytes_per_param / 1e9:.1f} GB\")\n";
  const out = h("pre", { class: "term", hidden: true }), status = h("div", { class: "run-status", "aria-live": "polite" });
  const ed = codeEditor(saved || start, () => run(), { label: "Python scratchpad", minLines: 14, maxLines: 30, onChange: v => { try { localStorage.setItem(KEY, v); } catch (e) { /* ignore */ } } });
  async function run() { status.className = "run-status"; status.textContent = "Running…"; try { const r = await runPython(ed.value); out.hidden = false; out.textContent = r.output.trim() || "(no output)"; status.className = "run-status " + (r.ok ? "good" : "bad"); status.textContent = r.ok ? "Ran without errors (" + r.where + ")" : "Error: see the last line of the output."; } catch (e) { status.className = "run-status bad"; status.textContent = e.message; } }
  const rows = [row([h("h1", { class: "headline" }, "Playground"), h("p", { class: "lead" }, "A free Python scratchpad and every systems calculator from the course in one place. Use it to check a number from a lesson, or to try an idea before the quiz asks for it."),
    h("section", { class: "block playground" }, blockTitle("Python scratchpad", "flask"), ed.el, h("div", { class: "row" }, h("button", { class: "btn primary", type: "button", onclick: run }, icon("play"), "Run"), h("span", { class: "kbd-hint" }, "Ctrl+Enter runs")), status, out)],
    [note("Where code runs", h("div", null, serverMode ? "On this computer, through the course helper, with a 20 second limit." : "Start the course with ./start.sh to run code. Opened as a file, the page cannot start Python."), serverMode ? "done" : "miss")], "masthead")];
  Object.keys(window.WIDGETS || {}).forEach(k => { const W = window.WIDGETS[k];
    rows.push(row(h("section", { class: "block widget", id: "w-" + k }, blockTitle(W.title, "calc"), W.blurb ? h("p", { class: "note-small" }, W.blurb) : null, W.mount(Object.assign({}, W.defaults), { h, icon, inline, tex2mml })), W.formula ? [note("Formula", h("div", { class: "mformula", html: tex2mml(W.formula, true) }))] : []));
  });
  fill(el, h("div", { class: "page playground-page" }, rows));
}
function renderGlossary() {
  const el = content(); const list = h("div", { class: "gloss" });
  const items = (C.glossary || []).slice().sort((a, b) => a.term.localeCompare(b.term, "en"));
  const draw = q => {
    const f = items.filter(g => !q || (g.term + " " + g.def).toLowerCase().indexOf(q.toLowerCase()) >= 0);
    const shown = f.slice(0, 300);
    count.textContent = f.length === items.length ? fmtInt(items.length) + " term" + (items.length === 1 ? "" : "s") : fmtInt(f.length) + " of " + fmtInt(items.length) + " terms" + (f.length > 300 ? ", first 300 shown" : "");
    list.replaceChildren(...(f.length ? shown.map(g => h("div", { class: "gloss-item" }, h("dt", null, g.term), h("dd", null, h("span", { html: inline(g.def) }), g.lesson && STUB[g.lesson] ? h("a", { class: "gloss-src", href: "#/lesson/" + g.lesson }, STUB[g.lesson].title) : null))) : [h("p", { class: "empty" }, items.length ? "No term matches “" + q + "”." : "Terms appear here as deep lessons define them.")]));
  };
  const count = h("div", { class: "mnum" });
  const inp = h("input", { class: "search", type: "search", placeholder: "Search terms", "aria-label": "Search terms", oninput: e => draw(e.target.value) });
  fill(el, h("div", { class: "page" }, row([h("h1", { class: "headline" }, "Glossary"), inp, list], [note("Terms", count)], "masthead"))); draw("");
}
function renderMissing() { fill(content(), h("div", { class: "page" }, row([h("h1", { class: "headline" }, "Nothing here"), h("p", null, "That address does not match a lesson or chapter."), h("a", { class: "btn", href: "#/home" }, "Back to the contents")], []))); }

/* ───────────── chrome ───────────── */
function railNav() {
  const cur = currentRoute.kind === "lesson" || currentRoute.kind === "ch" ? "home" : currentRoute.kind;
  return h("nav", { class: "rail-nav", "aria-label": "Course sections" }, [["home", "Contents"], ["playground", "Playground"], ["log", "Logbook"], ["glossary", "Glossary"]]
    .map(([k, l]) => h("a", { href: "#/" + k, class: k === cur ? "is-current" : null }, l)));
}
function renderRail() {
  const rail = $("#rail"); const r = currentRoute;
  let chId = r.kind === "ch" ? r.arg : r.kind === "lesson" && STUB[r.arg] ? C.chapters[CH_OF[r.arg]].id : null;
  if (!chId) {
    fill(rail, railNav(), h("div", { class: "rail-head" }, "Volumes"), h("ul", null, (C.parts || []).map(p => h("li", null, h("a", { href: "#/home", onclick: e => { e.preventDefault(); location.hash = "#/home"; setTimeout(() => { const t = document.getElementById("part-" + p.id); if (t) t.scrollIntoView(); }, 30); } }, p.label, h("small", null, p.title))))));
    return;
  }
  const ch = CH_BY_ID[chId], lab = chLabel(ch);
  fill(rail, railNav(), h("a", { class: "rail-back", href: "#/home" }, icon("back"), "All chapters"), h("a", { class: "rail-head" + (r.kind === "ch" ? " is-current" : ""), href: "#/ch/" + ch.id }, h("small", null, lab.tag), lab.name),
    h("ol", { class: "rail-lessons" }, ch.stubs.map(s => h("li", { class: (lessonDone(s.id) ? "is-done" : lessonStarted(s.id) ? "is-open" : "") + (r.arg === s.id ? " is-current" : "") },
      h("a", { href: "#/lesson/" + s.id, "aria-current": r.arg === s.id ? "page" : null }, h("span", { class: "rmark" }, lessonDone(s.id) ? icon("check") : null), h("span", null, s.title))))));
}
function refreshChrome() {
  const pct = overallPct(); const gf = $("#gaugeFill"); if (gf) gf.style.width = pct + "%"; const gp = $("#gaugePct"); if (gp) gp.textContent = pct + "%";
  renderRail();
  document.querySelectorAll(".topnav a").forEach(a => a.classList.toggle("is-current", a.getAttribute("href") === "#/" + (currentRoute.kind === "lesson" || currentRoute.kind === "ch" ? "home" : currentRoute.kind)));
}
function route() {
  const hash = location.hash.replace(/^#\/?/, "") || "home"; const [kind, ...rest] = hash.split("/"); const arg = decodeURIComponent(rest.join("/"));
  document.body.classList.remove("nav-open"); window.__drawRecord = null;
  currentRoute = { kind, arg };
  if (kind === "lesson") renderLesson(arg);
  else if (kind === "ch") renderChapter(arg);
  else if (kind === "log") renderLog();
  else if (kind === "playground") { renderPlayground(); if (arg) setTimeout(() => { const t = document.getElementById("w-" + arg); if (t) t.scrollIntoView({ block: "start" }); }, 0); }
  else if (kind === "glossary") renderGlossary();
  else { currentRoute = { kind: "home" }; renderHome(); }
  refreshChrome(); if (!(kind === "playground" && arg)) window.scrollTo(0, 0);
  const m = content(); if (m) m.focus({ preventScroll: true });
}
function initChrome() {
  document.documentElement.lang = "en"; document.title = "Machine Learning Systems · Interactive course";
  let theme = null; try { theme = localStorage.getItem("course-theme"); } catch (e) { /* ignore */ }
  if (!theme) theme = window.matchMedia && matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  const setTheme = th => { document.documentElement.dataset.theme = th; const b = $("#themeBtn"); b.replaceChildren(icon(th === "dark" ? "sun" : "moon")); b.setAttribute("aria-label", th === "dark" ? "Switch to the light theme" : "Switch to the dark theme"); };
  setTheme(theme);
  $("#themeBtn").onclick = () => { const n = document.documentElement.dataset.theme === "dark" ? "light" : "dark"; setTheme(n); try { localStorage.setItem("course-theme", n); } catch (e) { /* ignore */ } };
  $("#menuBtn").replaceChildren(icon("menu"));
  $("#menuBtn").onclick = () => document.body.classList.toggle("nav-open"); $("#scrim").onclick = () => document.body.classList.remove("nav-open");
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") document.body.classList.remove("nav-open");
    const t = e.target, typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    if (typing || e.ctrlKey || e.metaKey || e.altKey || currentRoute.kind !== "lesson") return;
    const pos = ORDER.indexOf(currentRoute.arg);
    if (e.key === "]" && pos >= 0 && pos < ORDER.length - 1) location.hash = "#/lesson/" + ORDER[pos + 1];
    if (e.key === "[" && pos > 0) location.hash = "#/lesson/" + ORDER[pos - 1];
  });
}
(async function boot() {
  initChrome(); await loadProgress(); setSaveState();
  window.addEventListener("hashchange", route); route();
  window.__course = { get progress() { return P; }, route, save, tex2mml, loadChapter };
})();
})();

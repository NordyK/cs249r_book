/* Systems calculators for the MLSys course. Each widget: { title, blurb, formula (LaTeX), defaults, mount(params, lib) }.
   A lesson uses one with {"type":"widget","widget":"<key>","params":{…},"challenge":{…}}; the Playground page lists all of them.
   Numbers follow the textbook's equations; every output says what it is in plain words. */
(function () {
"use strict";

const fmt = (x, digits) => {
  if (!isFinite(x)) return "∞";
  const a = Math.abs(x);
  if (a !== 0 && (a < 1e-3 || a >= 1e6)) { const e = Math.floor(Math.log10(a)); return (x / Math.pow(10, e)).toFixed(2) + "×10" + String(e).replace(/-/g, "⁻").replace(/\d/g, d => "⁰¹²³⁴⁵⁶⁷⁸⁹"[d]); }
  return x.toLocaleString("en-US", { maximumFractionDigits: digits == null ? (a < 10 ? 2 : a < 100 ? 1 : 0) : digits });
};
const time = s => s < 1e-6 ? fmt(s * 1e9) + " ns" : s < 1e-3 ? fmt(s * 1e6) + " µs" : s < 1 ? fmt(s * 1e3) + " ms" : s < 120 ? fmt(s) + " s" : s < 7200 ? fmt(s / 60) + " min" : s < 172800 ? fmt(s / 3600) + " h" : fmt(s / 86400) + " days";
const bytes = b => b < 1e3 ? fmt(b) + " B" : b < 1e6 ? fmt(b / 1e3) + " KB" : b < 1e9 ? fmt(b / 1e6) + " MB" : b < 1e12 ? fmt(b / 1e9) + " GB" : fmt(b / 1e12) + " TB";

/* controls: {key, label, min, max, step, log, unit, options:[[value,label]]} */
function build(lib, params, controls, compute) {
  const { h } = lib; const state = Object.assign({}, params);
  const outEl = h("div", { class: "w-out", "aria-live": "polite" });
  const ctrls = h("div", { class: "w-ctrls" });
  controls.forEach(c => {
    const id = "w" + Math.random().toString(36).slice(2, 8);
    const val = h("output", { class: "w-val", for: id });
    let input;
    if (c.options) {
      input = h("select", { id, class: "w-select" }, c.options.map(([v, l]) => h("option", Object.assign({ value: String(v) }, String(v) === String(state[c.key]) ? { selected: true } : {}), l)));
      input.addEventListener("change", () => { state[c.key] = isNaN(+input.value) ? input.value : +input.value; paint(); });
    } else {
      const toPos = v => c.log ? Math.log10(v) : v, fromPos = p => c.log ? Math.pow(10, p) : p;
      input = h("input", { id, type: "range", min: String(toPos(c.min)), max: String(toPos(c.max)), step: String(c.log ? (toPos(c.max) - toPos(c.min)) / 200 : c.step || 1) });
      input.value = String(toPos(state[c.key]));
      input.addEventListener("input", () => { let v = fromPos(+input.value); if (c.log) { const p = Math.pow(10, Math.floor(Math.log10(v)) - 1); v = Math.round(v / p) * p; } state[c.key] = v; paint(); });
    }
    ctrls.append(h("label", { class: "w-ctrl", for: id }, h("span", { class: "w-lab" }, c.label), input, c.options ? null : val));
    c._val = val;
  });
  function paint() {
    controls.forEach(c => { if (c._val) c._val.textContent = (c.show ? c.show(state[c.key]) : fmt(state[c.key])) + (c.unit ? " " + c.unit : ""); });
    const res = compute(state);
    outEl.replaceChildren(...res.rows.map(r => h("div", { class: "w-row" + (r.strong ? " is-strong" : "") }, h("span", { class: "w-k" }, r.k), h("span", { class: "w-v" }, r.v))),
      res.verdict ? h("p", { class: "w-verdict" }, res.verdict) : null, res.chart || null);
  }
  paint();
  return h("div", { class: "w-body" }, ctrls, outEl);
}

/* a small log-log line chart drawn in SVG; points [{x,y,label}] */
function logChart(lib, cfg) {
  const ns = "http://www.w3.org/2000/svg", W = 420, H = 220, L = 46, B = 30, T = 10, R = 12;
  const el = (n, a, txt) => { const e = document.createElementNS(ns, n); for (const k in a) e.setAttribute(k, a[k]); if (txt != null) e.textContent = txt; return e; };
  const lx = v => L + (Math.log10(v) - Math.log10(cfg.x0)) / (Math.log10(cfg.x1) - Math.log10(cfg.x0)) * (W - L - R);
  const ly = v => H - B - (Math.log10(v) - Math.log10(cfg.y0)) / (Math.log10(cfg.y1) - Math.log10(cfg.y0)) * (H - B - T);
  const svg = el("svg", { viewBox: "0 0 " + W + " " + H, class: "w-chart", role: "img", "aria-label": cfg.aria });
  for (let e = Math.ceil(Math.log10(cfg.x0)); e <= Math.log10(cfg.x1); e++) { const x = lx(Math.pow(10, e)); svg.append(el("line", { x1: x, x2: x, y1: T, y2: H - B, class: "grid" }), el("text", { x, y: H - B + 16, class: "tick", "text-anchor": "middle" }, "10" + (e === 0 ? "⁰" : String(e).replace(/-/g, "⁻").replace(/\d/g, d => "⁰¹²³⁴⁵⁶⁷⁸⁹"[d])))); }
  for (let e = Math.ceil(Math.log10(cfg.y0)); e <= Math.log10(cfg.y1); e++) { const y = ly(Math.pow(10, e)); svg.append(el("line", { x1: L, x2: W - R, y1: y, y2: y, class: "grid" }), el("text", { x: L - 6, y: y + 4, class: "tick", "text-anchor": "end" }, fmt(Math.pow(10, e)))); }
  svg.append(el("text", { x: (L + W - R) / 2, y: H - 2, class: "axis", "text-anchor": "middle" }, cfg.xl), el("text", { x: 12, y: (T + H - B) / 2, class: "axis", "text-anchor": "middle", transform: "rotate(-90 12 " + (T + H - B) / 2 + ")" }, cfg.yl));
  (cfg.lines || []).forEach(ln => svg.append(el("polyline", { points: ln.pts.map(p => lx(p[0]) + "," + ly(Math.max(cfg.y0, Math.min(cfg.y1, p[1])))).join(" "), class: "line " + (ln.cls || "") })));
  (cfg.points || []).forEach(p => { const x = lx(p.x), y = ly(Math.max(cfg.y0, Math.min(cfg.y1, p.y))); svg.append(el("circle", { cx: x, cy: y, r: 5, class: "pt " + (p.cls || "") }), el("text", { x: x + 8, y: y - 8, class: "pt-label" }, p.label)); });
  return svg;
}

const WIDGETS = {
  "iron-law": {
    title: "Iron law of ML systems", blurb: "Execution time splits into moving data and doing arithmetic, plus fixed overhead. Whichever term is larger sets the pace.",
    formula: "T \\approx \\frac{D_{\\text{vol}}}{\\text{BW}} + \\frac{O}{R_{\\text{peak}} \\cdot \\eta_{\\text{hw}}} + L_{\\text{lat}}",
    defaults: { ops: 1e15, peak: 312, eta: 0.4, dvol: 2e12, bw: 2000, lat: 0.01, pipelined: 1 },
    mount(p, lib) {
      return build(lib, p, [
        { key: "ops", label: "Total operations O", min: 1e9, max: 1e24, log: true, unit: "FLOP" },
        { key: "peak", label: "Peak compute R_peak", min: 1, max: 4000, log: true, unit: "TFLOP/s" },
        { key: "eta", label: "Utilisation η_hw", min: 0.05, max: 1, step: 0.01, show: v => Math.round(v * 100) + "%" },
        { key: "dvol", label: "Data moved D_vol", min: 1e6, max: 1e16, log: true, show: bytes },
        { key: "bw", label: "Memory bandwidth BW", min: 10, max: 10000, log: true, unit: "GB/s" },
        { key: "lat", label: "Fixed overhead L_lat", min: 0, max: 1, step: 0.001, show: time },
        { key: "pipelined", label: "Overlap", options: [[1, "Data and compute overlap (pipelined)"], [0, "One after the other (serial)"]] },
      ], s => {
        const tm = s.dvol / (s.bw * 1e9), tc = s.ops / (s.peak * 1e12 * s.eta);
        const total = (s.pipelined ? Math.max(tm, tc) : tm + tc) + s.lat;
        const bound = s.lat > Math.max(tm, tc) ? "overhead-bound: fixed latency dominates, so batching or fusing work helps most" : tm > tc ? "memory-bound: faster arithmetic would not help; move fewer bytes or get more bandwidth" : "compute-bound: more FLOP/s or higher utilisation helps; extra bandwidth would not";
        return { rows: [{ k: "Data movement D/BW", v: time(tm) }, { k: "Compute O/(R·η)", v: time(tc) }, { k: "Overhead", v: time(s.lat) }, { k: "Total time T", v: time(total), strong: true }], verdict: "This workload is " + bound + "." };
      });
    },
  },
  roofline: {
    title: "Roofline model", blurb: "Attainable performance is capped either by bandwidth times arithmetic intensity or by peak compute. The corner is the ridge point.",
    formula: "P = \\min\\left(R_{\\text{peak}},\\ \\text{BW} \\times I\\right)",
    defaults: { peak: 989, bw: 3.35, ai: 50 },
    mount(p, lib) {
      return build(lib, p, [
        { key: "peak", label: "Peak compute", min: 1, max: 5000, log: true, unit: "TFLOP/s" },
        { key: "bw", label: "Memory bandwidth", min: 0.05, max: 10, log: true, unit: "TB/s" },
        { key: "ai", label: "Arithmetic intensity I", min: 0.1, max: 10000, log: true, unit: "FLOP/byte" },
      ], s => {
        const ridge = s.peak / s.bw, perf = Math.min(s.peak, s.bw * s.ai);
        const pts = [[0.1, s.bw * 0.1], [ridge, s.peak], [10000, s.peak]];
        const chart = logChart(lib, { x0: 0.1, x1: 10000, y0: 0.01, y1: 10000, xl: "arithmetic intensity (FLOP/byte)", yl: "TFLOP/s", aria: "Roofline chart", lines: [{ pts, cls: "roof" }], points: [{ x: s.ai, y: perf, label: fmt(perf) + " TFLOP/s", cls: s.ai < ridge ? "mem" : "comp" }] });
        return { rows: [{ k: "Ridge point", v: fmt(ridge) + " FLOP/byte" }, { k: "Attainable performance", v: fmt(perf) + " TFLOP/s", strong: true }, { k: "Share of peak", v: Math.round(100 * perf / s.peak) + "%" }],
          verdict: s.ai < ridge ? "Left of the ridge: memory-bound. Raise intensity (fuse ops, bigger batches, reuse data in cache) before buying FLOP/s." : "Right of the ridge: compute-bound. Only more compute or better utilisation goes faster.", chart };
      });
    },
  },
  memory: {
    title: "Model memory footprint", blurb: "Weights are only the start: training also stores gradients, optimizer state and activations.",
    formula: "M_{\\text{train}} \\approx N\\,(b_w + b_g + b_{\\text{opt}}) + M_{\\text{act}}",
    defaults: { params: 7e9, bw: 2, opt: 12, act: 20, gpu: 80, mode: 1 },
    mount(p, lib) {
      return build(lib, p, [
        { key: "params", label: "Parameters N", min: 1e6, max: 1e12, log: true, show: v => fmt(v / 1e9) + " B" },
        { key: "bw", label: "Bytes per weight", options: [[4, "fp32 (4 bytes)"], [2, "fp16 / bf16 (2 bytes)"], [1, "int8 (1 byte)"], [0.5, "int4 (0.5 byte)"]] },
        { key: "mode", label: "Use", options: [[0, "Inference only"], [1, "Training"]] },
        { key: "opt", label: "Optimizer bytes per weight", options: [[0, "SGD, no momentum (0)"], [4, "SGD with momentum (4)"], [12, "Adam, fp32 master + 2 moments (12)"]] },
        { key: "act", label: "Activations", min: 0, max: 500, step: 1, unit: "GB" },
        { key: "gpu", label: "Accelerator memory", min: 8, max: 192, step: 8, unit: "GB" },
      ], s => {
        const w = s.params * s.bw, g = s.mode ? s.params * s.bw : 0, o = s.mode ? s.params * s.opt : 0, a = s.mode ? s.act * 1e9 : s.act * 1e9 * 0.05;
        const tot = w + g + o + a, n = Math.ceil(tot / (s.gpu * 1e9));
        return { rows: [{ k: "Weights", v: bytes(w) }, { k: "Gradients", v: bytes(g) }, { k: "Optimizer state", v: bytes(o) }, { k: s.mode ? "Activations" : "Activations / KV (≈5%)", v: bytes(a) }, { k: "Total", v: bytes(tot), strong: true }, { k: "Accelerators needed (memory only)", v: String(n) }],
          verdict: n > 1 ? "It does not fit on one " + s.gpu + " GB device: you need sharding, offloading or lower precision." : "Fits on one " + s.gpu + " GB device, with " + bytes(s.gpu * 1e9 - tot) + " to spare." };
      });
    },
  },
  quantize: {
    title: "Uniform quantization", blurb: "Map real values onto a small integer grid with a scale and a zero point, then see the error it introduces.",
    formula: "q = \\operatorname{round}\\left(\\frac{x}{s}\\right) + z,\\quad s = \\frac{x_{\\max} - x_{\\min}}{2^{b} - 1}",
    defaults: { bits: 8, xmin: -1, xmax: 1, x: 0.337 },
    mount(p, lib) {
      return build(lib, p, [
        { key: "bits", label: "Bits b", min: 2, max: 16, step: 1 },
        { key: "xmin", label: "Range minimum", min: -10, max: 0, step: 0.1 },
        { key: "xmax", label: "Range maximum", min: 0.1, max: 10, step: 0.1 },
        { key: "x", label: "Value x", min: -10, max: 10, step: 0.001 },
      ], s => {
        const levels = Math.pow(2, s.bits) - 1, scale = (s.xmax - s.xmin) / levels, z = Math.round(-s.xmin / scale);
        const xc = Math.max(s.xmin, Math.min(s.xmax, s.x)), q = Math.round(xc / scale) + z, xr = (q - z) * scale;
        return { rows: [{ k: "Scale s", v: fmt(scale, 6) }, { k: "Zero point z", v: String(z) }, { k: "Integer code q", v: String(q) }, { k: "Dequantized value", v: fmt(xr, 6) }, { k: "Error", v: fmt(Math.abs(s.x - xr), 6), strong: true }, { k: "Size vs fp32", v: Math.round(100 * s.bits / 32) + "%" }],
          verdict: s.x !== xc ? "x is outside the range, so it was clipped: clipping error is usually far worse than rounding error." : "Worst-case rounding error is half a step, " + fmt(scale / 2, 6) + "." };
      });
    },
  },
  amdahl: {
    title: "Amdahl's law", blurb: "Speeding up part of a system helps only through the share of time that part takes.",
    formula: "S = \\frac{1}{(1-p) + \\frac{p}{s}}",
    defaults: { p: 0.8, s: 10 },
    mount(p, lib) {
      return build(lib, p, [
        { key: "p", label: "Share of time sped up p", min: 0, max: 0.999, step: 0.001, show: v => (v * 100).toFixed(1) + "%" },
        { key: "s", label: "Speedup of that part s", min: 1, max: 1000, log: true, show: v => fmt(v) + "×" },
      ], s => {
        const S = 1 / ((1 - s.p) + s.p / s.s), lim = 1 / (1 - s.p);
        return { rows: [{ k: "Overall speedup", v: fmt(S) + "×", strong: true }, { k: "Limit with infinite s", v: isFinite(lim) ? fmt(lim) + "×" : "∞" }, { k: "Time left in the untouched part", v: Math.round(100 * (1 - s.p) / ((1 - s.p) + s.p / s.s)) + "%" }],
          verdict: S > 0.9 * lim ? "You are near the ceiling: the remaining " + Math.round((1 - s.p) * 100) + "% is now the bottleneck." : "There is still headroom from speeding this part up further." };
      });
    },
  },
  batching: {
    title: "Batching: latency against throughput", blurb: "A batch amortises fixed cost per call, but every request waits for the whole batch.",
    formula: "t_{\\text{batch}} = t_0 + B\\,t_1,\\quad \\text{throughput} = \\frac{B}{t_{\\text{batch}}}",
    defaults: { t0: 8, t1: 0.5, b: 8, slo: 50 },
    mount(p, lib) {
      return build(lib, p, [
        { key: "t0", label: "Fixed cost per call t₀", min: 0.1, max: 100, step: 0.1, unit: "ms" },
        { key: "t1", label: "Cost per request t₁", min: 0.01, max: 20, step: 0.01, unit: "ms" },
        { key: "b", label: "Batch size B", min: 1, max: 512, step: 1 },
        { key: "slo", label: "Latency target", min: 1, max: 500, step: 1, unit: "ms" },
      ], s => {
        const tb = s.t0 + s.b * s.t1, thr = s.b / tb * 1000, best = Math.max(1, Math.floor((s.slo - s.t0) / s.t1));
        return { rows: [{ k: "Batch time", v: fmt(tb) + " ms" }, { k: "Throughput", v: fmt(thr) + " requests/s", strong: true }, { k: "Throughput at B = 1", v: fmt(1000 / (s.t0 + s.t1)) + " requests/s" }, { k: "Largest batch within target", v: s.slo > s.t0 + s.t1 ? String(best) : "none" }],
          verdict: tb > s.slo ? "This batch misses the " + s.slo + " ms target." : "Within the target, with " + fmt(s.slo - tb) + " ms to spare." };
      });
    },
  },
  allreduce: {
    title: "Ring all-reduce time", blurb: "Each of N workers sends and receives 2(N−1)/N of the gradient, so time barely grows with N but never drops below 2S/BW.",
    formula: "T \\approx 2\\,\\frac{N-1}{N}\\,\\frac{S}{\\text{BW}} + 2(N-1)\\,\\alpha",
    defaults: { size: 14, n: 64, bw: 50, alpha: 5 },
    mount(p, lib) {
      return build(lib, p, [
        { key: "size", label: "Gradient size S", min: 0.01, max: 2000, log: true, unit: "GB" },
        { key: "n", label: "Workers N", min: 2, max: 4096, log: true, show: v => String(Math.round(v)) },
        { key: "bw", label: "Link bandwidth", min: 1, max: 900, log: true, unit: "GB/s" },
        { key: "alpha", label: "Per-step latency α", min: 0, max: 100, step: 0.5, unit: "µs" },
      ], s => {
        const n = Math.round(s.n), bwT = 2 * (n - 1) / n * s.size / s.bw, latT = 2 * (n - 1) * s.alpha * 1e-6;
        return { rows: [{ k: "Bandwidth term", v: time(bwT) }, { k: "Latency term", v: time(latT) }, { k: "All-reduce time", v: time(bwT + latT), strong: true }, { k: "Data each worker sends", v: bytes(2 * (n - 1) / n * s.size * 1e9) }],
          verdict: latT > bwT ? "Latency-bound: with this many workers, small messages cost more than the bytes. Tree or hierarchical algorithms help." : "Bandwidth-bound: faster links or gradient compression shorten it." };
      });
    },
  },
  kvcache: {
    title: "KV cache size", blurb: "Every generated token keeps a key and a value vector per layer and head; long contexts make this the memory wall of serving.",
    formula: "M_{KV} = 2 \\cdot L \\cdot H_{kv} \\cdot d_{h} \\cdot T \\cdot B \\cdot b",
    defaults: { layers: 32, heads: 8, dh: 128, seq: 8192, batch: 16, b: 2 },
    mount(p, lib) {
      return build(lib, p, [
        { key: "layers", label: "Layers L", min: 1, max: 128, step: 1 },
        { key: "heads", label: "KV heads H_kv", min: 1, max: 128, step: 1 },
        { key: "dh", label: "Head dimension d_h", min: 32, max: 256, step: 32 },
        { key: "seq", label: "Context length T", min: 128, max: 1048576, log: true, show: v => fmt(Math.round(v)) },
        { key: "batch", label: "Concurrent sequences B", min: 1, max: 512, step: 1 },
        { key: "b", label: "Bytes per value", options: [[2, "fp16 / bf16"], [1, "fp8 / int8"], [0.5, "int4"]] },
      ], s => {
        const per = 2 * s.layers * s.heads * s.dh * s.b, tot = per * Math.round(s.seq) * s.batch;
        return { rows: [{ k: "Per token", v: bytes(per) }, { k: "Per sequence", v: bytes(per * Math.round(s.seq)) }, { k: "Whole batch", v: bytes(tot), strong: true }], verdict: tot > 80e9 ? "More than one 80 GB accelerator just for the cache: paging, quantising the cache or fewer KV heads are the levers." : "Fits beside the weights on a single large accelerator." };
      });
    },
  },
  energy: {
    title: "Energy: moving data against computing", blurb: "Fetching a byte from DRAM costs far more energy than an arithmetic operation, so data movement usually dominates.",
    formula: "E \\approx D_{\\text{vol}} \\cdot E_{\\text{move}} + O \\cdot E_{\\text{compute}}",
    defaults: { dvol: 1e12, emove: 100, ops: 1e13, eop: 1 },
    mount(p, lib) {
      return build(lib, p, [
        { key: "dvol", label: "Bytes moved", min: 1e6, max: 1e16, log: true, show: bytes },
        { key: "emove", label: "Energy per byte", options: [[100, "DRAM ≈100 pJ"], [10, "on-chip SRAM ≈10 pJ"], [1000, "across a network ≈1 nJ"]] },
        { key: "ops", label: "Operations", min: 1e6, max: 1e18, log: true, unit: "ops" },
        { key: "eop", label: "Energy per op", options: [[1, "fp16 multiply-add ≈1 pJ"], [0.2, "int8 ≈0.2 pJ"], [4, "fp32 ≈4 pJ"]] },
      ], s => {
        const em = s.dvol * s.emove * 1e-12, ec = s.ops * s.eop * 1e-12;
        const j = x => x < 1 ? fmt(x * 1e3) + " mJ" : x < 3600 ? fmt(x) + " J" : fmt(x / 3.6e6) + " kWh";
        return { rows: [{ k: "Data movement", v: j(em) }, { k: "Compute", v: j(ec) }, { k: "Total", v: j(em + ec), strong: true }, { k: "Share spent moving data", v: Math.round(100 * em / (em + ec)) + "%" }], verdict: em > ec ? "Movement dominates: reuse data on chip before buying more efficient arithmetic." : "Compute dominates: lower precision or fewer operations save the most." };
      });
    },
  },
  degradation: {
    title: "Silent degradation", blurb: "Accuracy falls with the divergence between today's data and the training data, while every health check stays green.",
    formula: "\\text{Acc}(t) \\approx \\text{Acc}_0 - \\lambda \\cdot D(P_t \\,\\|\\, P_0)",
    defaults: { acc0: 0.95, lambda: 0.4, d: 0.1, floor: 0.9 },
    mount(p, lib) {
      return build(lib, p, [
        { key: "acc0", label: "Accuracy at launch", min: 0.5, max: 1, step: 0.005, show: v => (v * 100).toFixed(1) + "%" },
        { key: "lambda", label: "Sensitivity λ", min: 0, max: 2, step: 0.01 },
        { key: "d", label: "Divergence D", min: 0, max: 1, step: 0.005 },
        { key: "floor", label: "Acceptable accuracy", min: 0.5, max: 1, step: 0.005, show: v => (v * 100).toFixed(1) + "%" },
      ], s => {
        const acc = s.acc0 - s.lambda * s.d, dmax = s.lambda > 0 ? (s.acc0 - s.floor) / s.lambda : Infinity;
        return { rows: [{ k: "Expected accuracy now", v: (acc * 100).toFixed(1) + "%", strong: true }, { k: "Divergence budget before the floor", v: isFinite(dmax) ? fmt(dmax, 3) : "∞" }], verdict: acc < s.floor ? "Below the floor: time to investigate and retrain, even though nothing has crashed." : "Still above the floor; keep watching the divergence." };
      });
    },
  },
};
window.WIDGETS = WIDGETS;
})();

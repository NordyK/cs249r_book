#!/usr/bin/env python3
"""Hand-written hands-on labs: the "deep" layer that sits on top of the imported chapters.

Each lab is one lesson file placed right after the book section it practises (the "b" suffix sorts it
after that section's lesson), so the imported lesson explains and the lab makes the learner compute.
A lab alternates: a worked example (derivation or stepper), a calculator with a task, a Python
playground whose check must pass, and a short numeric quiz. Numbers are worked examples chosen for
this course, not values quoted from the book.

  python3 mlsys-course-tools/labs.py mlsys-course        # write the labs, self-test every playground
"""
import json
import os
import subprocess
import sys
import tempfile

LABS = []


def lab(chapter, after, slug, title, summary, minutes, blocks, terms=None):
    LABS.append({"chapter": chapter, "file": "%sb-lab-%s.json" % (after, slug), "lesson": {
        "title": title, "summary": summary, "minutes": minutes, "lab": True, "blocks": blocks,
        **({"terms": terms} if terms else {})}})


def q_num(text, answer, tol, unit, hint, why):
    return {"type": "numeric", "q": text, "answer": answer, "tolerance": tol, "unit": unit, "hint": hint, "explanation": why}


def q_one(text, options, answer, hint, why):
    return {"type": "single", "q": text, "options": options, "answer": answer, "hint": hint, "explanation": why}


# ───────────────────────── Vol I ch1: iron law ─────────────────────────
lab("v1-01", "07", "iron-law", "Lab: put numbers into the iron law",
    "Compute the three iron-law terms for one workload, find the dominant one and predict what an upgrade buys.", 25, [
        {"type": "text", "md": "The previous lesson gave the iron law in words. Here you use it the way an engineer does: plug in a workload, see which term is largest, and predict what a faster part would actually buy you.\n\nThe workload for the whole lab: one accelerator step that **moves 8 GB** of weights and activations over a **2,000 GB/s** memory bus, performs **$10^{11}$ FLOPs** at an effective **100 TFLOP/s** (peak 250 TFLOP/s at 40% utilisation), and pays **0.5 ms** of fixed overhead."},
        {"type": "derivation", "title": "Sequential time, term by term", "rel": "=", "steps": [
            {"lhs": "T", "rhs": r"\frac{D_{vol}}{BW} + \frac{O}{R_{peak}\,\eta_{hw}} + L_{lat}", "why": "The iron law with the three costs paid one after the other."},
            {"lhs": r"\frac{D_{vol}}{BW}", "rhs": r"\frac{8\times10^{9}\ \text{B}}{2\times10^{12}\ \text{B/s}} = 4\ \text{ms}", "why": "Bytes divided by bytes per second leaves seconds."},
            {"lhs": r"\frac{O}{R_{peak}\,\eta_{hw}}", "rhs": r"\frac{10^{11}}{250\times10^{12}\times0.4} = 1\ \text{ms}", "why": "The effective rate already includes utilisation; do not multiply by it twice."},
            {"lhs": "T", "rhs": r"4 + 1 + 0.5 = 5.5\ \text{ms}", "why": "Movement is the largest term, so this step is memory-bound."}]},
        {"type": "callout", "kind": "key", "md": "Doubling peak compute would shrink only the 1 ms term. Doubling bandwidth shrinks the 4 ms term. The iron law tells you which upgrade to buy **before** you buy it."},
        {"type": "widget", "id": "v1-01-lab-iron-widget", "widget": "iron-law", "title": "Try it: the same workload in the calculator",
         "md": "The calculator starts at the workload above, with the stages run one after the other. Move the bandwidth slider and watch which term leads.",
         "params": {"ops": 1e11, "peak": 250, "eta": 0.4, "dvol": 8e9, "bw": 2000, "lat": 0.0005, "pipelined": 0},
         "challenge": {"md": "Set bandwidth to **4,000 GB/s** (twice as fast). What is the new total time, in milliseconds?", "answer": 3.5, "tolerance": 0.05, "unit": "ms",
                       "hint": "Only the movement term changes: 8 GB at 4,000 GB/s.",
                       "explanation": "Movement drops from 4 ms to 2 ms; compute (1 ms) and overhead (0.5 ms) stay. 2 + 1 + 0.5 = 3.5 ms. Twice the bandwidth gave 1.57x, not 2x."}},
        {"type": "reveal", "prompt": "If movement and compute overlap perfectly (the pipelined bound), what is the best possible time before and after the bandwidth upgrade?",
         "md": "Before: max(4, 1) + 0.5 = **4.5 ms**. After: max(2, 1) + 0.5 = **2.5 ms**. After the upgrade movement is still the slower stage; once it falls below 1 ms, more bandwidth stops helping and compute becomes the wall."},
        {"type": "playground", "id": "v1-01-lab-iron-play", "title": "Write the iron law as a function",
         "md": "Complete `iron_law`. With `overlap=False` it returns the sum of the three terms; with `overlap=True` it returns the pipelined bound `max(movement, compute) + overhead`. Units: bytes, bytes/s, FLOPs, FLOP/s, seconds. **Run and check** tests it on the lab's workload.",
         "code": "def iron_law(d_vol, bw, ops, peak, eta, lat, overlap=False):\n    movement = d_vol / bw\n    compute = None  # TODO: operations divided by the effective rate\n    # TODO: return the sequential sum or the pipelined bound\n    return None\n\n\nt = iron_law(8e9, 2e12, 1e11, 250e12, 0.4, 0.5e-3)\nprint(\"sequential:\", t)\n",
         "check": "assert abs(iron_law(8e9, 2e12, 1e11, 250e12, 0.4, 0.5e-3) - 5.5e-3) < 1e-9, 'sequential time should be 5.5 ms'\nassert abs(iron_law(8e9, 2e12, 1e11, 250e12, 0.4, 0.5e-3, overlap=True) - 4.5e-3) < 1e-9, 'pipelined bound should be 4.5 ms'\nassert abs(iron_law(8e9, 4e12, 1e11, 250e12, 0.4, 0.5e-3) - 3.5e-3) < 1e-9, 'with 4 TB/s the sum is 3.5 ms'",
         "hint": "`compute = ops / (peak * eta)`; then `return (max(movement, compute) if overlap else movement + compute) + lat`.",
         "solution": "def iron_law(d_vol, bw, ops, peak, eta, lat, overlap=False):\n    movement = d_vol / bw\n    compute = ops / (peak * eta)\n    core = max(movement, compute) if overlap else movement + compute\n    return core + lat\n\n\nprint(\"sequential:\", iron_law(8e9, 2e12, 1e11, 250e12, 0.4, 0.5e-3))\nprint(\"pipelined: \", iron_law(8e9, 2e12, 1e11, 250e12, 0.4, 0.5e-3, overlap=True))\n"},
        {"type": "quiz", "id": "v1-01-lab-iron-quiz", "title": "Check your numbers", "questions": [
            q_num("A dense language model with $N = 10^9$ parameters trains on $D = 2\\times10^{10}$ tokens. Using $O \\approx 6ND$, how many FLOPs is that, in units of $10^{20}$?", 1.2, 0.01, "× 10²⁰ FLOP",
                  "6 × 10⁹ × 2 × 10¹⁰.", "6 × 1 × 2 = 12, and 10⁹ × 10¹⁰ = 10¹⁹, so 12 × 10¹⁹ = 1.2 × 10²⁰ FLOP."),
            q_num("Generating one token with a 7-billion-parameter model costs about $2N$ FLOPs. How many GFLOPs per token?", 14, 0.1, "GFLOP",
                  "2 × 7 × 10⁹.", "2N = 1.4 × 10¹⁰ FLOP = 14 GFLOP per token, forward pass only."),
            q_one("In the lab's workload, which change shortens the sequential time the most?",
                  ["Doubling peak compute", "Doubling memory bandwidth", "Halving the fixed overhead", "All three save the same time"], 1,
                  "Compare how many milliseconds each change removes.",
                  "Doubling bandwidth removes 2 ms, doubling compute removes 0.5 ms, halving overhead removes 0.25 ms. Fix the largest term first.")]},
        {"type": "summary", "points": ["The iron law adds movement, compute and overhead; the largest term sets the pace.",
                                       "An upgrade only helps through the term it shrinks, so it never speeds up the whole by its own factor.",
                                       "With perfect overlap the bound is max(movement, compute) + overhead."]}],
    terms=[{"term": "pipelined bound", "def": "max(movement time, compute time) + overhead: the best case when data movement and computation overlap perfectly"}])

# ───────────────────────── Vol I ch8: training memory ─────────────────────────
lab("v1-08", "03", "memory", "Lab: will this model fit for training?",
    "Count bytes per parameter for weights, gradients and Adam state, and size the accelerators a training run needs.", 25, [
        {"type": "text", "md": "Inference needs the weights. Training needs the weights, a gradient for every weight, the optimizer's state, and the activations saved for the backward pass. With mixed precision and Adam, the per-parameter bill is usually:\n\n- 2 bytes for the bf16 weight,\n- 2 bytes for its bf16 gradient,\n- 12 bytes of optimizer state: a 4-byte fp32 master copy plus two 4-byte moments.\n\nThat is **16 bytes per parameter** before a single activation is stored."},
        {"type": "stepper", "title": "A 7-billion-parameter model, step by step", "steps": [
            {"title": "Weights", "md": "7 × 10⁹ parameters × 2 bytes = **14 GB**. This alone fits on one 80 GB accelerator, which is why inference looks easy."},
            {"title": "Gradients", "md": "Another 2 bytes per parameter: **14 GB**. Running total 28 GB."},
            {"title": "Adam state", "md": "12 bytes per parameter: **84 GB**. Running total 112 GB, already more than one 80 GB device."},
            {"title": "Activations", "md": "Saved forward results for the backward pass. They grow with batch size and sequence length, often tens of GB. Activation checkpointing trades recomputation for this memory."}]},
        {"type": "widget", "id": "v1-08-lab-mem-widget", "widget": "memory", "title": "Try it: size the run",
         "params": {"params": 7e9, "bw": 2, "opt": 12, "act": 0, "gpu": 80, "mode": 1},
         "challenge": {"md": "With activations at 0, what is the total training memory for the 7B model in GB?", "answer": 112, "tolerance": 0.5, "unit": "GB",
                       "hint": "16 bytes per parameter.", "explanation": "7 × 10⁹ × 16 B = 112 GB, so even before activations the state must be split across at least two 80 GB devices (for example with ZeRO or FSDP sharding)."}},
        {"type": "playground", "id": "v1-08-lab-mem-play", "title": "Memory and training time in code",
         "md": "Complete both functions. `train_memory_gb` returns weights + gradients + optimizer state in GB (10⁹ bytes). `train_days` uses $O = 6ND$ and a cluster of `gpus` accelerators at `peak` FLOP/s and utilisation `eta`.",
         "code": "def train_memory_gb(params, bytes_w=2, bytes_g=2, bytes_opt=12):\n    # TODO\n    return None\n\n\ndef train_days(params, tokens, gpus, peak, eta):\n    ops = 6 * params * tokens\n    seconds = None  # TODO\n    return seconds / 86400 if seconds else None\n\n\nprint(train_memory_gb(7e9))\nprint(train_days(7e9, 1e12, 1000, 312e12, 0.4))\n",
         "check": "assert abs(train_memory_gb(7e9) - 112) < 1e-6, '7B with Adam should need 112 GB'\nassert abs(train_memory_gb(7e9, bytes_opt=0) - 28) < 1e-6\nassert abs(train_days(7e9, 1e12, 1000, 312e12, 0.4) - 3.8949) < 1e-3, 'expected about 3.89 days'",
         "hint": "`params * (bytes_w + bytes_g + bytes_opt) / 1e9`; `seconds = ops / (gpus * peak * eta)`.",
         "solution": "def train_memory_gb(params, bytes_w=2, bytes_g=2, bytes_opt=12):\n    return params * (bytes_w + bytes_g + bytes_opt) / 1e9\n\n\ndef train_days(params, tokens, gpus, peak, eta):\n    ops = 6 * params * tokens\n    seconds = ops / (gpus * peak * eta)\n    return seconds / 86400\n\n\nprint(train_memory_gb(7e9))\nprint(round(train_days(7e9, 1e12, 1000, 312e12, 0.4), 2), 'days')\n"},
        {"type": "quiz", "id": "v1-08-lab-mem-quiz", "title": "Check your numbers", "questions": [
            q_num("A 13-billion-parameter model trains with bf16 weights and gradients and Adam (16 bytes per parameter). How many GB of state, before activations?", 208, 0.5, "GB",
                  "13 × 10⁹ × 16 bytes.", "13 × 16 = 208, so 208 GB: at least three 80 GB devices once activations are added."),
            q_num("Training 7 × 10⁹ parameters on 10¹² tokens on 1,000 accelerators at 312 TFLOP/s peak and 40% utilisation: how many days?", 3.89, 0.05, "days",
                  "6ND FLOPs, divided by 1000 × 312 × 10¹² × 0.4 FLOP/s, divided by 86,400.",
                  "6 × 7 × 10⁹ × 10¹² = 4.2 × 10²²; the cluster delivers 1.248 × 10¹⁷ FLOP/s; 336,538 s ≈ 3.89 days."),
            q_one("Which part of training memory can activation checkpointing reduce?", ["Weights", "Gradients", "Optimizer state", "Saved activations"], 3,
                  "Checkpointing recomputes something during the backward pass.", "It stores only some forward results and recomputes the rest during backward, trading compute for activation memory. Weights, gradients and optimizer state need sharding or lower precision instead.")]},
        {"type": "summary", "points": ["Mixed-precision Adam costs about 16 bytes per parameter before activations.",
                                       "Training time ≈ 6ND / (accelerators × peak × utilisation).",
                                       "When state exceeds one device, shard it (ZeRO, FSDP) or lower its precision."]}])

# ───────────────────────── Vol I ch10: quantization ─────────────────────────
lab("v1-10", "03", "quantize", "Lab: quantize a number by hand",
    "Compute scale, zero point and integer codes for 8-bit and 4-bit quantization and measure the error.", 20, [
        {"type": "text", "md": "Uniform (affine) quantization maps a real range $[x_{min}, x_{max}]$ onto the integers $0 \\dots 2^b - 1$. Two numbers describe the mapping: the **scale** $s$, the real width of one integer step, and the **zero point** $z$, the integer that stands for real 0."},
        {"type": "derivation", "title": "8-bit code for x = 0.337 in the range [-1, 1]", "rel": "=", "steps": [
            {"lhs": "s", "rhs": r"\frac{1 - (-1)}{2^{8} - 1} = \frac{2}{255} \approx 0.007843", "why": "255 steps cover the whole range."},
            {"lhs": "z", "rhs": r"\operatorname{round}\left(\frac{1}{0.007843}\right) = 128", "why": "The integer that represents 0 (127.5 rounds up)."},
            {"lhs": "q", "rhs": r"\operatorname{round}\left(\frac{0.337}{0.007843}\right) + 128 = 43 + 128 = 171", "why": "Divide by the step, round, shift by the zero point."},
            {"lhs": r"\hat{x}", "rhs": r"(171 - 128)\times 0.007843 \approx 0.33725", "why": "Dequantize: the error is 0.00025, well under half a step."}]},
        {"type": "widget", "id": "v1-10-lab-q-widget", "widget": "quantize", "title": "Try it: fewer bits",
         "params": {"bits": 8, "xmin": -1, "xmax": 1, "x": 0.337},
         "challenge": {"md": "Drop to **4 bits**. What integer code q does 0.337 get now?", "answer": 11, "tolerance": 0, "unit": "",
                       "hint": "s = 2/15, z = round(7.5) = 8.", "explanation": "s = 0.1333, 0.337/0.1333 = 2.53 rounds to 3, plus z = 8 gives 11. It dequantizes to 0.4, an error of 0.063: 250 times worse than 8 bits."}},
        {"type": "playground", "id": "v1-10-lab-q-play", "title": "Quantize and dequantize in Python",
         "md": "Write `quantize` and `dequantize`. Round half up with `math.floor(v + 0.5)` so your answers match the calculator, and clip `x` into the range first.",
         "code": "import math\n\n\ndef params(xmin, xmax, bits):\n    s = (xmax - xmin) / (2 ** bits - 1)\n    z = math.floor(-xmin / s + 0.5)\n    return s, z\n\n\ndef quantize(x, xmin, xmax, bits):\n    s, z = params(xmin, xmax, bits)\n    # TODO: clip x into [xmin, xmax], then return the integer code\n    return None\n\n\ndef dequantize(q, xmin, xmax, bits):\n    s, z = params(xmin, xmax, bits)\n    # TODO\n    return None\n\n\nprint(quantize(0.337, -1, 1, 8))\n",
         "check": "assert quantize(0.337, -1, 1, 8) == 171\nassert quantize(0.337, -1, 1, 4) == 11\nassert abs(dequantize(171, -1, 1, 8) - 0.33725490) < 1e-6\nassert quantize(5.0, -1, 1, 8) == quantize(1.0, -1, 1, 8), 'values outside the range must be clipped'",
         "hint": "`x = min(max(x, xmin), xmax)`; `return math.floor(x / s + 0.5) + z`; dequantize is `(q - z) * s`.",
         "solution": "import math\n\n\ndef params(xmin, xmax, bits):\n    s = (xmax - xmin) / (2 ** bits - 1)\n    z = math.floor(-xmin / s + 0.5)\n    return s, z\n\n\ndef quantize(x, xmin, xmax, bits):\n    s, z = params(xmin, xmax, bits)\n    x = min(max(x, xmin), xmax)\n    return math.floor(x / s + 0.5) + z\n\n\ndef dequantize(q, xmin, xmax, bits):\n    s, z = params(xmin, xmax, bits)\n    return (q - z) * s\n\n\nfor b in (8, 4):\n    q = quantize(0.337, -1, 1, b)\n    print(b, 'bits:', q, dequantize(q, -1, 1, b))\n"},
        {"type": "quiz", "id": "v1-10-lab-q-quiz", "title": "Check your numbers", "questions": [
            q_num("How many GB do the weights of a 7-billion-parameter model take in int4?", 3.5, 0.01, "GB", "Half a byte per weight.", "7 × 10⁹ × 0.5 B = 3.5 GB, down from 14 GB in bf16 and 28 GB in fp32."),
            q_num("Going from fp32 to int8 shrinks weight memory by what factor?", 4, 0, "×", "Bytes before over bytes after.", "4 bytes to 1 byte: 4x smaller, and 4x less data to move per inference step."),
            q_one("A value outside $[x_{min}, x_{max}]$ is clipped. Why is a range set by one huge outlier a bad idea?", ["It makes every step wider, so all typical values lose precision", "It causes overflow in the integers", "It changes the zero point to a negative number", "It has no effect on accuracy"], 0,
                  "The scale is range divided by the number of steps.", "A wider range means a bigger step for every value. Calibration usually clips rare outliers to keep the common values precise.")]},
        {"type": "summary", "points": ["Scale = range / (2^b - 1); zero point = the integer that stands for 0.", "Each bit removed doubles the step size and roughly doubles the rounding error.", "Pick the range with calibration: clipping a few outliers usually beats a huge step for everyone."]}])

# ───────────────────────── Vol I ch11: roofline and Amdahl ─────────────────────────
lab("v1-11", "06", "roofline", "Lab: roofline and Amdahl",
    "Locate kernels on the roofline from their arithmetic intensity and bound end-to-end speedups with Amdahl's law.", 25, [
        {"type": "text", "md": "Two quick tools from this chapter decide most hardware questions. The **roofline** says how fast one kernel can go: $P = \\min(R_{peak}, BW \\times I)$, where $I$ is FLOPs per byte moved. **Amdahl's law** says how much a whole program gains when only part of it is accelerated."},
        {"type": "derivation", "title": "Where is the ridge of an accelerator with 989 TFLOP/s and 3.35 TB/s?", "rel": "=", "steps": [
            {"lhs": "I_{ridge}", "rhs": r"\frac{R_{peak}}{BW}", "why": "The intensity at which both limits meet."},
            {"lhs": "I_{ridge}", "rhs": r"\frac{989\times10^{12}}{3.35\times10^{12}} \approx 295\ \text{FLOP/byte}", "why": "Kernels below about 295 FLOP per byte cannot use the full peak."},
            {"lhs": "P_{matvec}", "rhs": r"3.35\ \text{TB/s} \times 1\ \text{FLOP/B} = 3.35\ \text{TFLOP/s}", "why": "A fp16 matrix-vector product does 2 FLOPs per 2-byte weight: intensity 1. It reaches 0.3% of peak."}]},
        {"type": "widget", "id": "v1-11-lab-roof-widget", "widget": "roofline", "title": "Try it: slide the kernel along the roofline",
         "params": {"peak": 989, "bw": 3.35, "ai": 1},
         "challenge": {"md": "What attainable performance (TFLOP/s) does a kernel with intensity **100 FLOP/byte** reach on this accelerator?", "answer": 335, "tolerance": 1, "unit": "TFLOP/s",
                       "hint": "100 is below the ridge, so bandwidth × intensity.", "explanation": "3.35 TB/s × 100 = 335 TFLOP/s, about a third of peak. Batching more tokens per weight read is how decoding climbs toward the ridge."}},
        {"type": "widget", "id": "v1-11-lab-amdahl-widget", "widget": "amdahl", "title": "Try it: Amdahl's ceiling",
         "params": {"p": 0.9, "s": 10},
         "challenge": {"md": "90% of a pipeline's time is matrix math, and a new accelerator makes that part 10x faster. What is the overall speedup?", "answer": 5.26, "tolerance": 0.02, "unit": "×",
                       "hint": "1 / ((1 - p) + p / s).", "explanation": "1 / (0.1 + 0.09) = 5.26x. Even with an infinitely fast accelerator the remaining 10% caps it at 10x."}},
        {"type": "playground", "id": "v1-11-lab-roof-play", "title": "Arithmetic intensity of a matrix multiply",
         "md": "A matrix multiply $C_{M\\times N} = A_{M\\times K} B_{K\\times N}$ does $2MNK$ FLOPs and, at best, moves each matrix once. Complete `intensity`, then use it with `attainable` to compare a square GEMM with a batch-1 decode step.",
         "code": "def intensity(M, N, K, bytes_per=2):\n    flops = 2 * M * N * K\n    moved = None  # TODO: bytes for A, B and C, each moved once\n    return flops / moved if moved else None\n\n\ndef attainable(i, peak=989e12, bw=3.35e12):\n    return min(peak, bw * i)\n\n\nfor shape in [(4096, 4096, 4096), (1, 4096, 4096)]:\n    i = intensity(*shape)\n    print(shape, i)\n",
         "check": "assert abs(intensity(4096, 4096, 4096) - 4096 / 3) < 1e-6, 'square GEMM: 1365.3 FLOP/byte'\nassert abs(intensity(1, 4096, 4096) - 0.9995) < 1e-3, 'batch-1 decode is about 1 FLOP/byte'\nassert attainable(intensity(4096, 4096, 4096)) == 989e12",
         "hint": "`moved = bytes_per * (M * K + K * N + M * N)`.",
         "solution": "def intensity(M, N, K, bytes_per=2):\n    flops = 2 * M * N * K\n    moved = bytes_per * (M * K + K * N + M * N)\n    return flops / moved\n\n\ndef attainable(i, peak=989e12, bw=3.35e12):\n    return min(peak, bw * i)\n\n\nfor shape in [(4096, 4096, 4096), (1, 4096, 4096)]:\n    i = intensity(*shape)\n    print(shape, round(i, 1), 'FLOP/B ->', round(attainable(i) / 1e12, 1), 'TFLOP/s')\n"},
        {"type": "quiz", "id": "v1-11-lab-roof-quiz", "title": "Check your understanding", "questions": [
            q_num("An accelerator has 400 TFLOP/s peak and 2 TB/s bandwidth. Where is its ridge point?", 200, 0.5, "FLOP/byte", "Peak over bandwidth.", "400 / 2 = 200 FLOP per byte."),
            q_num("If 95% of runtime is accelerated infinitely, what is the maximum overall speedup?", 20, 0.01, "×", "1 / (1 - p).", "1 / 0.05 = 20x. The untouched 5% is the ceiling."),
            q_one("A kernel sits far left of the ridge. Which change helps it most?", ["A chip with twice the peak FLOP/s", "Fusing it with its neighbours so data is reused on chip", "Raising the clock of the arithmetic units", "Nothing helps a memory-bound kernel"], 1,
                  "Left of the ridge, the slanted roof (bandwidth) is the limit.", "Memory-bound kernels gain from moving fewer bytes per FLOP: fusion, larger batches and on-chip reuse raise intensity. Extra peak FLOP/s goes unused.")]},
        {"type": "summary", "points": ["Ridge point = peak / bandwidth; below it a kernel is memory-bound.", "Square GEMMs have high intensity; batch-1 decoding has about 1 FLOP/byte.", "Amdahl: overall speedup ≤ 1 / (1 - p), however fast the accelerated part gets."]}])

# ───────────────────────── Vol I ch13: batching ─────────────────────────
lab("v1-13", "05", "batching", "Lab: choose a batch size under a latency target",
    "Trade latency for throughput with a simple batch cost model and find the largest batch that meets a service level objective.", 20, [
        {"type": "text", "md": "A serving call has a fixed cost $t_0$ (launch, weight reads, scheduling) and a per-request cost $t_1$. A batch of $B$ requests takes $t_0 + B\\,t_1$. Throughput grows with $B$ because $t_0$ is shared; latency grows too because every request waits for the whole batch."},
        {"type": "stepper", "title": "t₀ = 8 ms, t₁ = 0.5 ms", "steps": [
            {"title": "B = 1", "md": "8.5 ms per call, so **118 requests/s**."},
            {"title": "B = 8", "md": "8 + 4 = 12 ms for 8 requests: **667 requests/s**, 5.6x the throughput for 41% more latency."},
            {"title": "B = 32", "md": "8 + 16 = 24 ms: **1,333 requests/s**. Returns are flattening: throughput can never exceed 1/t₁ = 2,000 requests/s."},
            {"title": "The target", "md": "With a 50 ms latency target the largest batch is ⌊(50 - 8) / 0.5⌋ = **84**."}]},
        {"type": "widget", "id": "v1-13-lab-batch-widget", "widget": "batching", "title": "Try it: batch size against the target",
         "params": {"t0": 8, "t1": 0.5, "b": 8, "slo": 50},
         "challenge": {"md": "Tighten the target to **20 ms**. What is the largest batch that still meets it?", "answer": 24, "tolerance": 0, "unit": "requests",
                       "hint": "(20 - 8) / 0.5.", "explanation": "⌊12 / 0.5⌋ = 24, for 24 / 20 ms = 1,200 requests/s."}},
        {"type": "playground", "id": "v1-13-lab-batch-play", "title": "Batch planner",
         "md": "Complete `best_batch` (the largest B with t₀ + B·t₁ ≤ slo, or 0 if even one request misses) and `throughput` in requests per second. Times are in milliseconds.",
         "code": "def batch_ms(b, t0, t1):\n    return t0 + b * t1\n\n\ndef best_batch(t0, t1, slo):\n    # TODO\n    return None\n\n\ndef throughput(b, t0, t1):\n    # TODO: requests per second\n    return None\n\n\nb = best_batch(8, 0.5, 50)\nprint(b, throughput(b, 8, 0.5) if b else None)\n",
         "check": "assert best_batch(8, 0.5, 50) == 84\nassert best_batch(8, 0.5, 20) == 24\nassert best_batch(8, 0.5, 8.2) == 0\nassert abs(throughput(32, 8, 0.5) - 1333.333) < 0.01",
         "hint": "`int((slo - t0) // t1)` if `slo >= t0 + t1`, else 0. Throughput is `b / batch_ms(b, t0, t1) * 1000`.",
         "solution": "def batch_ms(b, t0, t1):\n    return t0 + b * t1\n\n\ndef best_batch(t0, t1, slo):\n    if slo < t0 + t1:\n        return 0\n    return int((slo - t0) // t1)\n\n\ndef throughput(b, t0, t1):\n    return b / batch_ms(b, t0, t1) * 1000\n\n\nfor slo in (50, 20):\n    b = best_batch(8, 0.5, slo)\n    print(slo, 'ms ->', b, 'requests,', round(throughput(b, 8, 0.5)), 'req/s')\n"},
        {"type": "quiz", "id": "v1-13-lab-batch-quiz", "title": "Check your numbers", "questions": [
            q_num("With t₀ = 8 ms and t₁ = 0.5 ms, what throughput does B = 32 give (requests per second)?", 1333, 1, "req/s", "32 requests in 24 ms.", "32 / 0.024 s = 1,333 requests/s."),
            q_num("What is the upper limit on throughput as B grows without bound?", 2000, 0, "req/s", "The fixed cost disappears per request.", "B / (t₀ + B t₁) approaches 1/t₁ = 1/0.5 ms = 2,000 requests/s."),
            q_one("Requests arrive slowly at night. What does a fixed large batch size do to them?", ["Nothing, batching is free", "They wait for the batch to fill, so latency rises even though the server is idle", "They are dropped", "Throughput rises"], 1,
                  "A batch only runs when it is full, unless a timeout fires.", "Serving systems pair a maximum batch size with a maximum wait time (dynamic batching), so quiet periods do not inflate latency.")]},
        {"type": "summary", "points": ["Batch time ≈ t₀ + B t₁: batching shares the fixed cost.", "Throughput approaches 1/t₁; latency keeps growing with B.", "Pick the largest B that meets the latency target, and cap the wait time."]}])

# ───────────────────────── Vol I ch14: silent degradation ─────────────────────────
lab("v1-14", "05", "drift", "Lab: measure drift before accuracy drops",
    "Quantify distribution shift with the population stability index and turn an accuracy floor into a drift budget.", 20, [
        {"type": "text", "md": "A model can lose accuracy while every dashboard stays green: latency fine, no errors, just worse answers. Monitoring therefore watches the **inputs**. One common score is the population stability index (PSI), comparing today's histogram of a feature with the training histogram:\n\n$$\\text{PSI} = \\sum_i (a_i - e_i)\\,\\ln\\frac{a_i}{e_i}$$\n\nwhere $e_i$ and $a_i$ are the expected (training) and actual (today) shares of bin $i$. A common rule of thumb reads below 0.1 as stable and above 0.25 as a significant shift."},
        {"type": "widget", "id": "v1-14-lab-drift-widget", "widget": "degradation", "title": "Try it: how much drift can you afford?",
         "md": "A simple linear model of decay: accuracy falls by λ for each unit of divergence.",
         "params": {"acc0": 0.95, "lambda": 0.4, "d": 0.1, "floor": 0.9},
         "challenge": {"md": "Launch accuracy 95%, sensitivity λ = 0.4, floor 90%. How much divergence can the model absorb before it crosses the floor?", "answer": 0.125, "tolerance": 0.001, "unit": "",
                       "hint": "(acc₀ - floor) / λ.", "explanation": "0.05 / 0.4 = 0.125. Set the drift alert below that so you retrain before users notice."}},
        {"type": "playground", "id": "v1-14-lab-psi-play", "title": "Compute the PSI",
         "md": "Complete `psi`. Both arguments are lists of bin shares that sum to 1. Add a tiny `eps` to every share so an empty bin does not divide by zero.",
         "code": "import math\n\n\ndef psi(expected, actual, eps=1e-6):\n    total = 0.0\n    for e, a in zip(expected, actual):\n        e, a = e + eps, a + eps\n        # TODO: add this bin's contribution\n    return total\n\n\ntrain = [0.25, 0.25, 0.25, 0.25]\ntoday = [0.10, 0.20, 0.30, 0.40]\nprint(round(psi(train, today), 4))\n",
         "check": "assert abs(psi([0.25] * 4, [0.25] * 4)) < 1e-9, 'identical histograms give 0'\nassert abs(psi([0.25] * 4, [0.10, 0.20, 0.30, 0.40]) - 0.2282) < 1e-3, 'expected PSI about 0.228'\nassert psi([0.5, 0.5], [0.9, 0.1]) > 0.25",
         "hint": "`total += (a - e) * math.log(a / e)`.",
         "solution": "import math\n\n\ndef psi(expected, actual, eps=1e-6):\n    total = 0.0\n    for e, a in zip(expected, actual):\n        e, a = e + eps, a + eps\n        total += (a - e) * math.log(a / e)\n    return total\n\n\nprint(round(psi([0.25] * 4, [0.10, 0.20, 0.30, 0.40]), 4))\n"},
        {"type": "quiz", "id": "v1-14-lab-drift-quiz", "title": "Check your understanding", "questions": [
            q_num("Training shares are [0.25, 0.25, 0.25, 0.25] and today's are [0.10, 0.20, 0.30, 0.40]. What is the PSI (2 decimals)?", 0.23, 0.01, "", "Sum (a - e) ln(a / e) over the four bins.", "0.1374 + 0.0112 + 0.0091 + 0.0705 ≈ 0.228: a moderate shift, close to the 0.25 alarm line."),
            q_one("Why monitor input distributions instead of waiting for accuracy to drop?", ["Labels for production data usually arrive late or never", "Input monitoring is more accurate than accuracy", "Accuracy cannot be computed in production by law", "Drift never affects accuracy"], 0,
                  "What do you need to compute accuracy?", "Accuracy needs ground-truth labels, which often arrive days later or not at all. Input drift is visible immediately and serves as an early warning.")]},
        {"type": "summary", "points": ["Silent failures show up in the data before they show up in errors.", "PSI compares binned distributions; around 0.25 signals a significant shift.", "Turn an accuracy floor into a drift budget and alert before it is spent."]}])

# ───────────────────────── Vol II ch5: all-reduce ─────────────────────────
lab("v2-05", "06", "allreduce", "Lab: price a ring all-reduce",
    "Estimate gradient synchronisation time with the bandwidth and latency terms of ring all-reduce.", 20, [
        {"type": "text", "md": "In data-parallel training every worker must end each step with the sum of all gradients. A ring all-reduce does it in $2(N-1)$ rounds; in each round every worker sends $1/N$ of the data to its neighbour. Each worker therefore sends $2\\frac{N-1}{N}S$ bytes in total, which is why the time barely depends on $N$ but never drops below $2S/BW$."},
        {"type": "derivation", "title": "7B model, bf16 gradients (14 GB), 64 workers, 50 GB/s links, 5 µs per round", "rel": "=", "steps": [
            {"lhs": "T_{bw}", "rhs": r"2\cdot\frac{63}{64}\cdot\frac{14\ \text{GB}}{50\ \text{GB/s}} \approx 0.551\ \text{s}", "why": "The bytes every worker must push through its link."},
            {"lhs": "T_{lat}", "rhs": r"2\cdot 63 \cdot 5\ \mu\text{s} = 0.63\ \text{ms}", "why": "One fixed start-up cost per round."},
            {"lhs": "T", "rhs": r"\approx 0.552\ \text{s}", "why": "Bandwidth-bound: the latency term is a rounding error at this message size."}]},
        {"type": "widget", "id": "v2-05-lab-ar-widget", "widget": "allreduce", "title": "Try it: workers and links",
         "params": {"size": 14, "n": 64, "bw": 50, "alpha": 5},
         "challenge": {"md": "Keep 14 GB and 50 GB/s but use only **8 workers**. What is the all-reduce time in seconds?", "answer": 0.49, "tolerance": 0.003, "unit": "s",
                       "hint": "2 × 7/8 × 14 / 50, plus a tiny latency term.", "explanation": "2 × 0.875 × 0.28 = 0.49 s (+0.07 ms latency). Going from 8 to 64 workers adds only 12%: the ring scales."}},
        {"type": "playground", "id": "v2-05-lab-ar-play", "title": "All-reduce cost model",
         "md": "Complete `ring_allreduce_s(size_gb, n, bw_gbs, alpha_us)` returning seconds, then print it for 8, 64 and 1,024 workers. Notice when the latency term starts to matter.",
         "code": "def ring_allreduce_s(size_gb, n, bw_gbs, alpha_us):\n    bandwidth_term = None  # TODO\n    latency_term = None    # TODO\n    return bandwidth_term + latency_term if bandwidth_term is not None else None\n\n\nfor n in (8, 64, 1024):\n    print(n, ring_allreduce_s(14, n, 50, 5))\n",
         "check": "assert abs(ring_allreduce_s(14, 64, 50, 5) - (2 * 63 / 64 * 14 / 50 + 2 * 63 * 5e-6)) < 1e-9\nassert abs(ring_allreduce_s(14, 8, 50, 0) - 0.49) < 1e-9\nassert ring_allreduce_s(0.001, 1024, 50, 5) > 0.01, 'small messages on many workers are latency-bound'",
         "hint": "`bandwidth_term = 2 * (n - 1) / n * size_gb / bw_gbs`; `latency_term = 2 * (n - 1) * alpha_us * 1e-6`.",
         "solution": "def ring_allreduce_s(size_gb, n, bw_gbs, alpha_us):\n    bandwidth_term = 2 * (n - 1) / n * size_gb / bw_gbs\n    latency_term = 2 * (n - 1) * alpha_us * 1e-6\n    return bandwidth_term + latency_term\n\n\nfor n in (8, 64, 1024):\n    print(n, round(ring_allreduce_s(14, n, 50, 5), 4), 's')\n"},
        {"type": "quiz", "id": "v2-05-lab-ar-quiz", "title": "Check your understanding", "questions": [
            q_num("How many bytes does each worker send in a ring all-reduce of 14 GB across 64 workers (GB, 2 decimals)?", 27.56, 0.01, "GB", "2 (N - 1) / N × S.", "2 × 63/64 × 14 = 27.56 GB: about twice the gradient, whatever N is."),
            q_one("A 1 MB gradient bucket is all-reduced across 1,024 workers. What dominates?", ["The bandwidth term", "The latency term", "Both are equal", "Neither: it is free"], 1,
                  "Count the rounds.", "2 × 1023 rounds × 5 µs ≈ 10 ms of latency against about 0.04 ms of transfer. Tree or hierarchical algorithms and larger buckets fix this.")]},
        {"type": "summary", "points": ["Ring all-reduce: T ≈ 2(N-1)/N · S/BW + 2(N-1)·α.", "The bandwidth term is nearly independent of N; the latency term grows with N.", "Large buckets keep it bandwidth-bound; hierarchy helps at very large N."]}])

# ───────────────────────── Vol II ch15: energy ─────────────────────────
lab("v2-15", "04", "energy", "Lab: where does the energy go?",
    "Split a workload's energy into data movement and arithmetic and see why on-chip reuse matters.", 15, [
        {"type": "text", "md": "Energy follows the same split as time: $E \\approx D_{vol} E_{move} + O\\,E_{op}$. The coefficients used in this lab are illustrative orders of magnitude: about 100 pJ per byte from DRAM, about 10 pJ per byte from on-chip SRAM, and about 1 pJ for a 16-bit multiply-add. The exact values depend on the chip; the ratio is what drives design."},
        {"type": "widget", "id": "v2-15-lab-energy-widget", "widget": "energy", "title": "Try it: DRAM against on-chip reuse",
         "params": {"dvol": 1e12, "emove": 100, "ops": 1e13, "eop": 1},
         "challenge": {"md": "The workload moves 1 TB and performs 10¹³ operations. Serve the bytes from **on-chip SRAM** (10 pJ/byte) instead of DRAM. What is the total energy in joules?", "answer": 20, "tolerance": 0.1, "unit": "J",
                       "hint": "10¹² × 10 pJ plus 10¹³ × 1 pJ.", "explanation": "10 J for movement plus 10 J for compute = 20 J, down from 110 J with DRAM. Same arithmetic, 5.5x less energy."}},
        {"type": "playground", "id": "v2-15-lab-energy-play", "title": "Energy model",
         "md": "Complete `energy_j` and `movement_share`.",
         "code": "def energy_j(bytes_moved, pj_per_byte, ops, pj_per_op):\n    # TODO: total joules\n    return None\n\n\ndef movement_share(bytes_moved, pj_per_byte, ops, pj_per_op):\n    # TODO: fraction of the energy spent moving data\n    return None\n\n\nprint(energy_j(1e12, 100, 1e13, 1), movement_share(1e12, 100, 1e13, 1))\n",
         "check": "assert abs(energy_j(1e12, 100, 1e13, 1) - 110) < 1e-9\nassert abs(energy_j(1e12, 10, 1e13, 1) - 20) < 1e-9\nassert abs(movement_share(1e12, 100, 1e13, 1) - 100 / 110) < 1e-9",
         "hint": "pJ are 10⁻¹² J: `(bytes_moved * pj_per_byte + ops * pj_per_op) * 1e-12`.",
         "solution": "def energy_j(bytes_moved, pj_per_byte, ops, pj_per_op):\n    return (bytes_moved * pj_per_byte + ops * pj_per_op) * 1e-12\n\n\ndef movement_share(bytes_moved, pj_per_byte, ops, pj_per_op):\n    move = bytes_moved * pj_per_byte\n    return move / (move + ops * pj_per_op)\n\n\nprint(energy_j(1e12, 100, 1e13, 1), 'J,', round(100 * movement_share(1e12, 100, 1e13, 1)), '% moving data')\n"},
        {"type": "quiz", "id": "v2-15-lab-energy-quiz", "title": "Check your numbers", "questions": [
            q_num("With DRAM at 100 pJ/byte, what percentage of the lab workload's energy is data movement (whole number)?", 91, 1, "%", "100 J of 110 J.", "100 / 110 = 91%: arithmetic is the small part."),
            q_one("Which design change attacks the largest energy term here?", ["Faster arithmetic units", "Keeping operands on chip and reusing them (tiling, systolic arrays)", "A higher clock", "More DRAM capacity"], 1,
                  "Look at the 91%.", "Reuse cuts the bytes fetched from DRAM; that is the motivation behind tiling, systolic arrays and operator fusion.")]},
        {"type": "summary", "points": ["E ≈ bytes × energy per byte + ops × energy per op.", "An off-chip byte costs on the order of 100x a 16-bit multiply-add.", "On-chip reuse saves energy as well as time."]}])

# ───────────────────────── Vol III ch5: KV cache ─────────────────────────
lab("v3-05", "02", "kvcache", "Lab: size the KV cache",
    "Compute the attention state a serving system must hold per token, per sequence and per batch.", 20, [
        {"type": "text", "md": "During generation each layer keeps a key and a value vector for every past token so it never recomputes them. The cache size is\n\n$$M_{KV} = 2 \\cdot L \\cdot H_{kv} \\cdot d_h \\cdot T \\cdot B \\cdot b$$\n\nlayers, KV heads, head dimension, tokens, concurrent sequences and bytes per value. Unlike the weights, it grows with every token and every user."},
        {"type": "derivation", "title": "32 layers, 8 KV heads, d_h = 128, bf16", "rel": "=", "steps": [
            {"lhs": "\\text{per token}", "rhs": r"2 \times 32 \times 8 \times 128 \times 2 = 131{,}072\ \text{B} \approx 131\ \text{KB}", "why": "Key and value, every layer, every KV head."},
            {"lhs": "\\text{per sequence}", "rhs": r"131\ \text{KB} \times 8192 \approx 1.07\ \text{GB}", "why": "An 8K-token conversation."},
            {"lhs": "\\text{batch of 16}", "rhs": r"\approx 17.2\ \text{GB}", "why": "Before a single weight is loaded."}]},
        {"type": "widget", "id": "v3-05-lab-kv-widget", "widget": "kvcache", "title": "Try it: grouped-query attention",
         "params": {"layers": 32, "heads": 8, "dh": 128, "seq": 8192, "batch": 16, "b": 2},
         "challenge": {"md": "Without grouped-query attention the model would keep **32 KV heads**. What would the whole batch's cache be, in GB?", "answer": 68.7, "tolerance": 0.3, "unit": "GB",
                       "hint": "Four times as many KV heads.", "explanation": "4 × 17.18 GB ≈ 68.7 GB: almost a whole 80 GB accelerator for the cache alone. Sharing KV heads is one of the main levers serving has."}},
        {"type": "playground", "id": "v3-05-lab-kv-play", "title": "KV cache calculator",
         "md": "Complete `kv_bytes`, then use `max_sequences` to see how many 8K conversations fit beside 14 GB of weights on an 80 GB accelerator.",
         "code": "def kv_bytes(layers, kv_heads, head_dim, tokens, batch=1, bytes_per=2):\n    # TODO\n    return None\n\n\ndef max_sequences(free_gb, tokens, **model):\n    per_seq = kv_bytes(tokens=tokens, **model)\n    return int(free_gb * 1e9 // per_seq) if per_seq else None\n\n\nmodel = dict(layers=32, kv_heads=8, head_dim=128)\nprint(kv_bytes(tokens=1, **model), 'bytes per token')\nprint(max_sequences(80 - 14, 8192, **model), 'sequences of 8K tokens')\n",
         "check": "assert kv_bytes(32, 8, 128, 1) == 131072\nassert kv_bytes(32, 8, 128, 8192, batch=16) == 17179869184\nassert max_sequences(66, 8192, layers=32, kv_heads=8, head_dim=128) == 61",
         "hint": "`2 * layers * kv_heads * head_dim * tokens * batch * bytes_per`.",
         "solution": "def kv_bytes(layers, kv_heads, head_dim, tokens, batch=1, bytes_per=2):\n    return 2 * layers * kv_heads * head_dim * tokens * batch * bytes_per\n\n\ndef max_sequences(free_gb, tokens, **model):\n    per_seq = kv_bytes(tokens=tokens, **model)\n    return int(free_gb * 1e9 // per_seq)\n\n\nmodel = dict(layers=32, kv_heads=8, head_dim=128)\nprint(kv_bytes(tokens=1, **model), 'bytes per token')\nprint(max_sequences(80 - 14, 8192, **model), 'sequences of 8K tokens')\n"},
        {"type": "quiz", "id": "v3-05-lab-kv-quiz", "title": "Check your numbers", "questions": [
            q_num("Same model, one sequence of 128K (131,072) tokens. How many GB of KV cache (1 decimal)?", 17.2, 0.1, "GB", "131,072 B per token × 131,072 tokens.", "131,072² B ≈ 17.2 GB for one long conversation: as much as a batch of sixteen 8K ones."),
            q_one("Storing the cache in fp8 instead of bf16 does what?", ["Halves the cache, so twice as many sequences fit", "Has no effect on memory", "Doubles the cache", "Removes the need for a cache"], 0,
                  "Bytes per value goes from 2 to 1.", "Every term but b stays the same, so memory halves. The cost is a small accuracy risk that has to be evaluated.")]},
        {"type": "summary", "points": ["KV cache = 2 · layers · KV heads · head dim · tokens · batch · bytes.", "It grows with context length and concurrency, so it caps how many users fit.", "Levers: fewer KV heads (GQA), lower precision, paging and prefix sharing."]}])


def self_test():
    """Every playground: the starter must fail its check, the solution must pass it."""
    bad = 0
    for L in LABS:
        for b in L["lesson"]["blocks"]:
            if b["type"] != "playground" or not b.get("check"):
                continue
            for which, code, want in (("starter", b["code"], False), ("solution", b["solution"], True)):
                with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as f:
                    f.write(code + "\n\n" + b["check"] + "\nprint('ok')\n")
                p = subprocess.run([sys.executable, "-I", f.name], capture_output=True, text=True, timeout=30)
                os.unlink(f.name)
                ok = p.returncode == 0
                if ok != want:
                    bad += 1
                    print("FAIL %s %s: %s" % (b["id"], which, (p.stderr or p.stdout)[-400:]))
    return bad


def main():
    course = sys.argv[1] if len(sys.argv) > 1 else "mlsys-course"
    bad = self_test()
    if bad:
        sys.exit("%d playground self-tests failed" % bad)
    for L in LABS:
        d = os.path.join(course, "content", L["chapter"])
        les = dict(L["lesson"]); les.pop("lab", None)
        les["source"] = {"chapter": L["chapter"], "sections": ["hands-on lab"]}
        with open(os.path.join(d, L["file"]), "w", encoding="utf-8") as f:
            json.dump(les, f, ensure_ascii=False, indent=1)
        print("wrote", L["chapter"], L["file"])
    print("%d labs, all playground checks verified" % len(LABS))


if __name__ == "__main__":
    main()

#!/usr/bin/env bash
# Full matting pipeline, CPU-only, no GPU. Reproducible from scratch.
set -euo pipefail
SP="/tmp/claude-1001/-home-archy-jeisonxm-github-io/ab849e21-0869-4348-9524-78050999b3ea/scratchpad"
SRC="/home/archy/img-scratch/originals"
PY="$SP/work/venv/bin/python"
OUT="$SP/recon/matting"

mkdir -p "$SP/work/alpha" "$SP/work/alpha2" "$OUT/web"

echo "== Stage A: BiRefNet matte (1024px working height, ONNX arena disabled) =="
$PY "$SP/work/stage_a_matte.py"     "$SRC" "$SP/work/alpha" birefnet-general-lite 1024

echo "== Stage A2: keep largest connected component (drops other runners / stray poles) =="
$PY "$SP/work/stage_a2_cc.py"       "$SP/work/alpha" "$SP/work/alpha2"

echo "== Stage B: defringe + composite onto full-res RGB =="
$PY "$SP/work/stage_b2_defringe.py" "$SRC" "$SP/work/alpha2" "$OUT" 0.35

echo "== Stage C: AVIF + WebP with alpha at 1800px =="
node "$SP/work/stage_c_encode.js"   "$OUT" "$OUT/web" 1800

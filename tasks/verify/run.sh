#!/usr/bin/env bash
# Suite de aceptacion multi-motor. Una sola orden.
#   ./run.sh              -> probe + selftest
#   ./run.sh probe        -> solo probe.mjs
#   ./run.sh selftest     -> solo selftest-transform.mjs
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
export WK_SYSROOT="$HERE/sysroot/usr/lib/x86_64-linux-gnu"
export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1
cd "$HERE"
case "${1:-all}" in
  probe)    node probe.mjs --json ;;
  selftest) node selftest-transform.mjs ;;
  *)        node selftest-transform.mjs; echo; node probe.mjs --json ;;
esac

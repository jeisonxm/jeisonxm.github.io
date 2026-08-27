# Entorno para correr a mano los scripts sueltos del arnes
# (measure.mjs, ab.mjs, scrim.mjs, perfmetrics.mjs, shots.mjs).
#
#   source tasks/verify/env.sh && node tasks/verify/measure.mjs webkit
#
# run.sh NO necesita esto: resuelve lo mismo por su cuenta.
_VERIFY_HERE="$(cd "$(dirname "${BASH_SOURCE[0]:-${(%):-%x}}")" && pwd)"
PW_HARNESS="${PW_HARNESS:-$HOME/pw-harness}"

export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1
# WebKit no arranca sin las 19 libs de sistema; aqui no hay sudo.
# wk_run.sh las inyecta via WK_SYSROOT (pw_run.sh no sirve: pisa LD_LIBRARY_PATH).
export WK_SYSROOT="${WK_SYSROOT:-$PW_HARNESS/sysroot/usr/lib/x86_64-linux-gnu}"
# Directorio de salida de capturas y medidas. Fuera del repo a proposito.
export VERIFY_OUT="${VERIFY_OUT:-$PW_HARNESS/shots}"

[ -d "$WK_SYSROOT" ] || echo "aviso: no existe $WK_SYSROOT — corre tasks/verify/run.sh setup" >&2
[ -e "$_VERIFY_HERE/node_modules" ] || ln -sfn "$PW_HARNESS/node_modules" "$_VERIFY_HERE/node_modules" 2>/dev/null || true
unset _VERIFY_HERE

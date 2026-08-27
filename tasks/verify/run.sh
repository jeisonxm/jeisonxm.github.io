#!/usr/bin/env bash
# Suite de aceptacion multi-motor. Una sola orden.
#
#   ./run.sh              selftest + render + probe   (lo que decide si T1 esta verde)
#   ./run.sh selftest     control POSITIVO: la metrica del transform no es ciega
#   ./run.sh render       los 3 motores arrancan Y PINTAN, con control negativo
#   ./run.sh probe        reconocimiento del sitio -> probe-results.json
#   ./run.sh selfcheck    rompe cosas a proposito: el arnes tiene que dar ROJO
#   ./run.sh stability    corre la suite 3 veces y compara VEREDICTOS
#   ./run.sh baseline     congela probe-results.json en baseline.json
#   ./run.sh setup        reconstruye el arnes desde cero (ver §3.2 del plan)
#
# El arnes NO vive en el repo: playwright y el sysroot de WebKit pesan ~500 MB y
# son especificos de esta maquina. Viven en ~/pw-harness y se reconstruyen con
# `./run.sh setup`. Lo unico versionado son los scripts y baseline.json.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
HARNESS="${PW_HARNESS:-$HOME/pw-harness}"

export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1

die() { printf '%s\n' "$@" >&2; exit 1; }

# --- WebKit necesita 24 libs del sistema y aqui no hay sudo: sysroot privado. ---
resolve_sysroot() {
  local c
  for c in "${WK_SYSROOT:-}" "$HERE/sysroot/usr/lib/x86_64-linux-gnu" \
           "$HARNESS/sysroot/usr/lib/x86_64-linux-gnu"; do
    [[ -n "$c" && -d "$c" ]] && { printf '%s' "$c"; return 0; }
  done
  return 1
}

# --- `import 'playwright'` en ESM no mira NODE_PATH: hace falta un node_modules
#     alcanzable subiendo desde tasks/verify. De ahi el enlace simbolico. ---
ensure_node_modules() {
  [[ -e "$HERE/node_modules" ]] && return 0
  [[ -d "$HARNESS/node_modules" ]] || return 1
  ln -sfn "$HARNESS/node_modules" "$HERE/node_modules"
}

setup() {
  echo "== 1/4 playwright 1.62.1 en $HARNESS"
  mkdir -p "$HARNESS"
  ( cd "$HARNESS" && [[ -f package.json ]] || npm init -y >/dev/null )
  ( cd "$HARNESS" && npm install playwright@1.62.1 )
  echo "== 2/4 navegadores"
  ( cd "$HARNESS" && npx playwright install webkit firefox chromium )
  echo "== 3/4 sysroot de WebKit (Ubuntu 24.04 noble, sin sudo)"
  mkdir -p "$HARNESS/deb" "$HARNESS/sysroot"
  # Los nombres son de noble. En otra version hay que remapearlos, y sin sudo no
  # hay `playwright install-deps` de rescate.
  local pkgs="libgtk-4-1 libevent-2.1-7t64 libflite1 libwebpdemux2 libavif16
    libwebpmux3 libwayland-server0 libmanette-0.2-0 libenchant-2-2 libsecret-1-0
    libx264-164 libgstreamer-plugins-bad1.0-0 libcairo-script-interpreter2
    libdav1d7 libgav1-1 librav1e0 libyuv0 libx264-dev libsvtav1enc1d1"
  # Un sysroot A MEDIAS es peor que ninguno: resolve_sysroot solo mira que el
  # directorio exista, asi que el arnes arrancaria y WebKit moriria con
  # "error while loading shared libraries: libevent-2.1.so.7". Comprobado
  # envenenando el sysroot real. Aqui se cuenta y se muere.
  local faltan=() total=0
  for p in $pkgs; do
    total=$((total + 1))
    ( cd "$HARNESS/deb" && apt-get download "$p" ) || faltan+=("$p")
  done
  echo "descargados: $((total - ${#faltan[@]})) / $total"
  ((${#faltan[@]} == 0)) || die \
    "faltan ${#faltan[@]} de $total paquetes: ${faltan[*]}" \
    "  Sin ellos WebKit no arranca." \
    "  Causas tipicas: sin red -- NO corras setup en segundo plano, ahi el sandbox" \
    "  no tiene red y fallan los 19 sin decir por que -- o listas de apt viejas."
  for f in "$HARNESS"/deb/*.deb; do dpkg-deb -x "$f" "$HARNESS/sysroot"; done
  # libx264.so se reporta como faltante aunque exista: playwright valida con
  # `ldconfig -p`, que lee /etc/ld.so.cache e IGNORA LD_LIBRARY_PATH. Falso
  # positivo, solo afecta a reproducir h.264. De ahi el SKIP_VALIDATE de arriba.
  local libdir="$HARNESS/sysroot/usr/lib/x86_64-linux-gnu"
  [[ -f "$libdir/libx264.so.164" ]] || die "no se extrajo libx264.so.164: el sysroot esta incompleto"
  ln -sf libx264.so.164 "$libdir/libx264.so"
  echo "== 4/4 enlace de node_modules"
  ensure_node_modules || die "no se pudo enlazar node_modules"
  echo
  echo "== comprobacion: el arnes tiene que arrancar los 3 motores"
  # Decir "arnes reconstruido" sin ejecutarlo es exactamente el error que este
  # plan persigue. El control positivo es la comprobacion mas barata que existe.
  WK_SYSROOT="$libdir" node "$HERE/selftest-transform.mjs" >/dev/null \
    || die "setup termino pero el control positivo NO pasa. El arnes no sirve todavia."
  echo "arnes reconstruido y verificado. Ahora: ./run.sh"
}

if [[ "${1:-all}" == "setup" ]]; then setup; exit 0; fi

ensure_node_modules || die \
  "FALTA playwright." \
  "  $HARNESS/node_modules no existe." \
  "  Reconstruye el arnes:  $HERE/run.sh setup"

if SYSROOT="$(resolve_sysroot)"; then
  export WK_SYSROOT="$SYSROOT"
else
  die \
    "FALTA el sysroot de WebKit." \
    "  WebKit no arranca sin las 19 libs de sistema y aqui no hay sudo." \
    "  Reconstruye el arnes:  $HERE/run.sh setup"
fi

cd "$HERE"
case "${1:-all}" in
  probe)    node probe.mjs --json ;;
  selftest) node selftest-transform.mjs ;;
  render)   node render-check.mjs ;;
  selfcheck) node selfcheck.mjs ;;
  stability) node stability.mjs "${2:-}" ;;
  baseline)
    [[ -f probe-results.json ]] || die "no hay probe-results.json todavia: corre ./run.sh probe"
    node -e '
      const fs = require("node:fs"), cp = require("node:child_process");
      const git = (a) => cp.execSync("git " + a, { cwd: __dirname + "/../.." }).toString().trim();
      fs.writeFileSync("baseline.json", JSON.stringify({
        que: "Linea base del sitio ANTES del rediseno de profundidad. Congelada por tasks/verify/run.sh baseline.",
        como: "salida literal de probe.mjs en webkit 26.5 / firefox 153 / chromium 151, viewport 1440x900",
        commit: git("rev-parse --short HEAD"),
        capturado: new Date().toISOString().slice(0, 10),
        contra_que_se_compara: [
          "transform.changed debe pasar de false a true en los 3 motores (T5)",
          "transform.before debe pasar de -41.9327 a 0 exacto en p=0 (T5)",
          "wheelSynthetic.panelReached debe pasar de 1 a 3 con 3 gestos @120ms (T7). La via sintetica es la que mide el gesto: la confiable no gobierna su propio timing"
        ],
        resultados: JSON.parse(fs.readFileSync("probe-results.json", "utf8"))
      }, null, 2) + "\n");
      console.log("baseline.json escrito");
    '
    ;;
  all|*)
    node selftest-transform.mjs; echo
    node render-check.mjs; echo
    node probe.mjs --json
    ;;
esac

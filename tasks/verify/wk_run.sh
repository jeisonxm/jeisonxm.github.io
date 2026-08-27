#!/usr/bin/env bash
# Launcher de WebKit (Playwright) que anade el sysroot local de libs del sistema.
# Reemplaza a pw_run.sh, que pisa LD_LIBRARY_PATH y por eso no ve el sysroot.
SYSROOT="${WK_SYSROOT:?WK_SYSROOT no definido}"
WK="${WK_BROWSER_DIR:?WK_BROWSER_DIR no definido}"
if [[ "$*" == *--headless* ]]; then MB="$WK/minibrowser-wpe"; else MB="$WK/minibrowser-gtk"; fi
export WEBKIT_EXEC_PATH="$MB/bin"
export WEBKIT_INJECTED_BUNDLE_PATH="$MB/lib"
export WEBKIT_INSPECTOR_RESOURCES_PATH="$MB/share"
export LD_LIBRARY_PATH="$MB/lib:$MB/sys/lib:$SYSROOT"
export WEBKIT_FORCE_COMPLEX_TEXT=1
exec "$MB/bin/MiniBrowser" "$@"

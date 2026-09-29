#!/usr/bin/env bash
# Builds and runs the host unit tests, then the Android-parser conformance check.
#
#   CXX="g++" ./run_host_tests.sh                   # any C++17 compiler
#   CXX="python -m ziglang c++" ./run_host_tests.sh  # zig from PyPI (pip install ziglang)
#
# ArduinoJson (header-only, 7.x) is taken from ARDUINOJSON_SRC, or from the
# arduino-cli user library folder if that is not set.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
out="${OUT_DIR:-$(mktemp -d)}"
CXX="${CXX:-g++}"

if [ -z "${ARDUINOJSON_SRC:-}" ]; then
  userdir="$(arduino-cli config get directories.user 2>/dev/null | tr -d '\r')"
  command -v cygpath >/dev/null && userdir="$(cygpath "$userdir")"
  ARDUINOJSON_SRC="$userdir/libraries/ArduinoJson/src"
fi
[ -f "$ARDUINOJSON_SRC/ArduinoJson.h" ] || { echo "ArduinoJson not found in $ARDUINOJSON_SRC" >&2; exit 2; }

exe="$out/host_tests$( [ "${OS:-}" = "Windows_NT" ] && echo .exe )"
$CXX -std=c++17 -O1 -Wall -Wextra -Werror ${CXXFLAGS:-} \
  -I"$ARDUINOJSON_SRC" \
  "$here/host_tests.cpp" \
  "$here/../LightGuideNode/src/lg_protocol.cpp" \
  "$here/../LightGuideNode/src/lg_sensor_logic.cpp" \
  -o "$exe"

"$exe"
"$exe" --emit-samples > "$out/samples.tsv"
node "$here/conformance.mjs" "$out/samples.tsv"

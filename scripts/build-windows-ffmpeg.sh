#!/usr/bin/env bash

set -euo pipefail

# WatchAlong's Windows media tools are built from the signed, unmodified
# FFmpeg release with no third-party libraries linked in. This keeps the
# shipped binaries useful for decoding, probing, filtering, and stream-copy
# while making their complete corresponding source small and unambiguous.

FFMPEG_VERSION='8.1.2'
FFMPEG_SOURCE_URL='https://ffmpeg.org/releases/ffmpeg-8.1.2.tar.xz'
FFMPEG_SOURCE_SHA256='464beb5e7bf0c311e68b45ae2f04e9cc2af88851abb4082231742a74d97b524c'
FFMPEG_SIGNATURE_URL='https://ffmpeg.org/releases/ffmpeg-8.1.2.tar.xz.asc'
FFMPEG_SIGNATURE_SHA256='0a0963fccd70597838073f3e31b20f4a4d8cc2b5e577472c9a5a1f22624246f8'
FFMPEG_SIGNING_KEY_URL='https://ffmpeg.org/ffmpeg-devel.asc'
FFMPEG_SIGNING_KEY_SHA256='397b3becedcd5a98769967ff1ff8501ddc89f8368b8f766e4701377d7dbaabe5'
FFMPEG_SIGNING_KEY_FINGERPRINT='FCF986EA15E6E293A5644F10B4322F04D67658D8'
FFMPEG_SOURCE_DATE_EPOCH='1781663615'

NASM_VERSION='3.02'
NASM_SOURCE_URL='https://www.nasm.us/pub/nasm/releasebuilds/3.02/nasm-3.02.tar.xz'
NASM_SOURCE_SHA256='87336eba53b4acfe917424ab5d500d2b0054d9f5148d35c2273ccf2cfb712f0d'

LLVM_MINGW_VERSION='20260407'
LLVM_MINGW_URL='https://github.com/mstorsjo/llvm-mingw/releases/download/20260407/llvm-mingw-20260407-ucrt-ubuntu-22.04-x86_64.tar.xz'
LLVM_MINGW_SHA256='c39aeb4823bbc89ce2a40820964a114614a524c2cb7be1e3dafd16f780fa39b1'

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPOSITORY_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
SOURCE_INPUTS_MANIFEST="$SCRIPT_DIR/ffmpeg-windows-source-inputs.json"
WORK_DIR="$REPOSITORY_ROOT/build/ffmpeg-windows-x64"
OUTPUT_DIR="$REPOSITORY_ROOT/dist/ffmpeg-windows-x64"
JOBS='4'
INSTALL_TO_REPOSITORY='false'
WATCHALONG_VERSION=''

usage() {
  cat <<'EOF'
Usage: bash scripts/build-windows-ffmpeg.sh [options]

Options:
  --work-dir PATH    Fresh working directory (default: build/ffmpeg-windows-x64)
  --output-dir PATH  Binary and source-bundle output directory
  --jobs COUNT       Parallel build jobs (default: 4)
  --watchalong-version VERSION
                     Release version (normally derived from package.json)
  --install          Copy verified binaries into resources/tools/ffmpeg
  --help             Show this help

Run this script on x86_64 Linux or WSL. It intentionally refuses to reuse a
partially populated build directory; choose a fresh --work-dir for each build.
EOF
}

fail() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --work-dir)
      [[ $# -ge 2 ]] || fail '--work-dir requires a path'
      WORK_DIR="$2"
      shift 2
      ;;
    --output-dir)
      [[ $# -ge 2 ]] || fail '--output-dir requires a path'
      OUTPUT_DIR="$2"
      shift 2
      ;;
    --jobs)
      [[ $# -ge 2 ]] || fail '--jobs requires a positive integer'
      JOBS="$2"
      shift 2
      ;;
    --watchalong-version)
      [[ $# -ge 2 ]] || fail '--watchalong-version requires a value'
      WATCHALONG_VERSION="$2"
      shift 2
      ;;
    --install)
      INSTALL_TO_REPOSITORY='true'
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      fail "unknown argument: $1"
      ;;
  esac
done

[[ "$JOBS" =~ ^[1-9][0-9]*$ ]] || fail '--jobs must be a positive integer'
[[ "$(uname -s)" == 'Linux' ]] || fail 'this cross-build requires Linux or WSL'
[[ "$(uname -m)" == 'x86_64' ]] || fail 'the pinned llvm-mingw toolchain requires an x86_64 host'

for command_name in cmp curl gpg make python3 sha256sum tar xz; do
  command -v "$command_name" >/dev/null 2>&1 || fail "required command not found: $command_name"
done

MANIFEST_WATCHALONG_VERSION="$(
  python3 -c 'import json, sys; print(json.load(open(sys.argv[1], encoding="utf-8"))["watchAlongVersion"])' \
    "$SOURCE_INPUTS_MANIFEST"
)"
MANIFEST_FFMPEG_VERSION="$(
  python3 -c 'import json, sys; print(json.load(open(sys.argv[1], encoding="utf-8"))["ffmpegVersion"])' \
    "$SOURCE_INPUTS_MANIFEST"
)"
if [[ -z "$WATCHALONG_VERSION" ]]; then
  if [[ -f "$REPOSITORY_ROOT/package.json" ]]; then
    WATCHALONG_VERSION="$(
      python3 -c 'import json, sys; print(json.load(open(sys.argv[1], encoding="utf-8"))["version"])' \
        "$REPOSITORY_ROOT/package.json"
    )"
  else
    WATCHALONG_VERSION="$MANIFEST_WATCHALONG_VERSION"
  fi
fi
[[ "$WATCHALONG_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][A-Za-z0-9.-]+)?$ ]] \
  || fail "invalid WatchAlong version: $WATCHALONG_VERSION"
[[ "$WATCHALONG_VERSION" == "$MANIFEST_WATCHALONG_VERSION" ]] \
  || fail "WatchAlong package/source-manifest version mismatch ($WATCHALONG_VERSION vs $MANIFEST_WATCHALONG_VERSION)"
[[ "$FFMPEG_VERSION" == "$MANIFEST_FFMPEG_VERSION" ]] \
  || fail "FFmpeg recipe/source-manifest version mismatch ($FFMPEG_VERSION vs $MANIFEST_FFMPEG_VERSION)"

SOURCE_BUNDLE_BASENAME="WatchAlong-v$WATCHALONG_VERSION-ffmpeg-corresponding-source-windows-x64-$FFMPEG_VERSION"
SOURCE_BUNDLE_ROOT="$WORK_DIR/source-bundle/$SOURCE_BUNDLE_BASENAME"
MANIFEST_SOURCE_ASSET="$(
  python3 -c 'import json, sys; print(json.load(open(sys.argv[1], encoding="utf-8"))["correspondingSourceAsset"])' \
    "$SOURCE_INPUTS_MANIFEST"
)"
[[ "$MANIFEST_SOURCE_ASSET" == "$SOURCE_BUNDLE_BASENAME.tar.xz" ]] \
  || fail "source-asset name differs from the source manifest ($SOURCE_BUNDLE_BASENAME.tar.xz vs $MANIFEST_SOURCE_ASSET)"

if [[ -e "$WORK_DIR/source" || -e "$WORK_DIR/nasm-source" || -e "$WORK_DIR/toolchain" ]]; then
  fail "working directory is already populated; choose a fresh --work-dir: $WORK_DIR"
fi

DOWNLOAD_DIR="$WORK_DIR/downloads"
FFMPEG_SOURCE_DIR="$WORK_DIR/source"
NASM_SOURCE_DIR="$WORK_DIR/nasm-source"
NASM_PREFIX="$WORK_DIR/nasm"
TOOLCHAIN_DIR="$WORK_DIR/toolchain"

mkdir -p "$DOWNLOAD_DIR" "$FFMPEG_SOURCE_DIR" "$NASM_SOURCE_DIR" \
  "$NASM_PREFIX" "$TOOLCHAIN_DIR" "$OUTPUT_DIR"

download_verified() {
  local url="$1"
  local expected_sha256="$2"
  local destination="$3"

  if [[ ! -f "$destination" ]]; then
    printf 'Downloading %s\n' "$url"
    curl --fail --location --proto '=https' --tlsv1.2 \
      --output "$destination.partial" "$url"
    mv -- "$destination.partial" "$destination"
  fi

  local actual_sha256
  actual_sha256="$(sha256sum "$destination" | awk '{print $1}')"
  [[ "$actual_sha256" == "$expected_sha256" ]] || \
    fail "SHA-256 mismatch for $destination (expected $expected_sha256, got $actual_sha256)"
}

FFMPEG_ARCHIVE="$DOWNLOAD_DIR/ffmpeg-$FFMPEG_VERSION.tar.xz"
FFMPEG_SIGNATURE="$DOWNLOAD_DIR/ffmpeg-$FFMPEG_VERSION.tar.xz.asc"
FFMPEG_SIGNING_KEY="$DOWNLOAD_DIR/ffmpeg-devel.asc"
NASM_ARCHIVE="$DOWNLOAD_DIR/nasm-$NASM_VERSION.tar.xz"
LLVM_MINGW_ARCHIVE="$DOWNLOAD_DIR/llvm-mingw-$LLVM_MINGW_VERSION-ucrt-ubuntu-22.04-x86_64.tar.xz"

download_verified "$FFMPEG_SOURCE_URL" "$FFMPEG_SOURCE_SHA256" "$FFMPEG_ARCHIVE"
download_verified "$FFMPEG_SIGNATURE_URL" "$FFMPEG_SIGNATURE_SHA256" "$FFMPEG_SIGNATURE"
download_verified "$FFMPEG_SIGNING_KEY_URL" "$FFMPEG_SIGNING_KEY_SHA256" "$FFMPEG_SIGNING_KEY"
download_verified "$NASM_SOURCE_URL" "$NASM_SOURCE_SHA256" "$NASM_ARCHIVE"
download_verified "$LLVM_MINGW_URL" "$LLVM_MINGW_SHA256" "$LLVM_MINGW_ARCHIVE"

GNUPG_HOME="$WORK_DIR/gnupg"
mkdir -m 700 "$GNUPG_HOME"
gpg --batch --quiet --homedir "$GNUPG_HOME" --import "$FFMPEG_SIGNING_KEY"
ACTUAL_FINGERPRINT="$(
  gpg --batch --homedir "$GNUPG_HOME" --with-colons --fingerprint \
    | awk -F: '$1 == "fpr" { print $10; exit }'
)"
[[ "$ACTUAL_FINGERPRINT" == "$FFMPEG_SIGNING_KEY_FINGERPRINT" ]] || \
  fail "unexpected FFmpeg signing-key fingerprint: $ACTUAL_FINGERPRINT"
SIGNATURE_STATUS_FILE="$WORK_DIR/ffmpeg-signature.status"
gpg --batch --homedir "$GNUPG_HOME" --status-fd=1 \
  --verify "$FFMPEG_SIGNATURE" "$FFMPEG_ARCHIVE" \
  > "$SIGNATURE_STATUS_FILE"
ACTUAL_SIGNER_FINGERPRINT="$(
  awk '$2 == "VALIDSIG" { print $3; exit }' "$SIGNATURE_STATUS_FILE"
)"
[[ "$ACTUAL_SIGNER_FINGERPRINT" == "$FFMPEG_SIGNING_KEY_FINGERPRINT" ]] || \
  fail "unexpected FFmpeg signature fingerprint: $ACTUAL_SIGNER_FINGERPRINT"

tar -xJf "$NASM_ARCHIVE" -C "$NASM_SOURCE_DIR" --strip-components=1
(
  cd "$NASM_SOURCE_DIR"
  ./configure --prefix="$NASM_PREFIX" --without-zlib
  make -j"$JOBS"
  make install
)

tar -xJf "$LLVM_MINGW_ARCHIVE" -C "$TOOLCHAIN_DIR" --strip-components=1
tar -xJf "$FFMPEG_ARCHIVE" -C "$FFMPEG_SOURCE_DIR" --strip-components=1

if [[ -f "$REPOSITORY_ROOT/FFMPEG_LGPL_2.1.txt" ]]; then
  cmp -s "$REPOSITORY_ROOT/FFMPEG_LGPL_2.1.txt" "$FFMPEG_SOURCE_DIR/COPYING.LGPLv2.1" \
    || fail 'FFMPEG_LGPL_2.1.txt differs from the signed FFmpeg source license text'
fi

export PATH="$NASM_PREFIX/bin:$TOOLCHAIN_DIR/bin:$PATH"
export SOURCE_DATE_EPOCH="$FFMPEG_SOURCE_DATE_EPOCH"

(
  cd "$FFMPEG_SOURCE_DIR"
  ./configure \
    --prefix=/opt/watchalong-ffmpeg \
    --target-os=mingw32 \
    --arch=x86_64 \
    --enable-cross-compile \
    --cross-prefix=x86_64-w64-mingw32- \
    --disable-autodetect \
    --disable-debug \
    --disable-doc \
    --disable-ffplay \
    --enable-static \
    --disable-shared \
    --enable-schannel \
    --extra-ldflags='-static -Wl,--no-insert-timestamp'
  make -j"$JOBS" ffmpeg.exe ffprobe.exe
)

cp -- "$FFMPEG_SOURCE_DIR/ffmpeg.exe" "$OUTPUT_DIR/ffmpeg.exe"
cp -- "$FFMPEG_SOURCE_DIR/ffprobe.exe" "$OUTPUT_DIR/ffprobe.exe"

FFMPEG_CONFIGURATION=''
for executable in "$OUTPUT_DIR/ffmpeg.exe" "$OUTPUT_DIR/ffprobe.exe"; do
  FILE_HEADERS="$("$TOOLCHAIN_DIR/bin/llvm-readobj" --file-headers "$executable")"
  [[ "$FILE_HEADERS" == *'IMAGE_FILE_MACHINE_AMD64'* ]] \
    || fail "not a Windows x64 executable: $executable"
  [[ "$FILE_HEADERS" == *'TimeDateStamp: '*'(0x0)'* ]] \
    || fail "non-reproducible PE timestamp in $executable"

  STRINGS_FILE="$WORK_DIR/$(basename "$executable").strings"
  "$TOOLCHAIN_DIR/bin/llvm-strings" "$executable" > "$STRINGS_FILE"
  CONFIGURATION="$(grep -m 1 'configuration: --prefix=' "$STRINGS_FILE")"
  CONFIGURATION="${CONFIGURATION#%s}"
  [[ -n "$CONFIGURATION" ]] || fail "FFmpeg configuration not found in $executable"
  if [[ "$(basename "$executable")" == 'ffmpeg.exe' ]]; then
    FFMPEG_CONFIGURATION="$CONFIGURATION"
  fi
  [[ "$CONFIGURATION" == *'--disable-autodetect'* ]] \
    || fail "missing --disable-autodetect in $executable"
  [[ "$CONFIGURATION" == *'--no-insert-timestamp'* ]] \
    || fail "missing deterministic linker timestamp control in $executable"
  [[ "$CONFIGURATION" != *'--enable-nonfree'* ]] \
    || fail "nonfree FFmpeg build rejected: $executable"
  [[ "$CONFIGURATION" != *'--enable-gpl'* ]] \
    || fail "GPL FFmpeg build rejected; the Windows build must remain LGPL: $executable"
  [[ "$CONFIGURATION" != *'--enable-lib'* ]] \
    || fail "external FFmpeg library unexpectedly linked: $executable"

  mapfile -t IMPORTED_DLLS < <(
    "$TOOLCHAIN_DIR/bin/llvm-readobj" --coff-imports "$executable" \
      | awk '/Name:/ { print $2 }' \
      | sort -fu
  )
  for imported_dll in "${IMPORTED_DLLS[@]}"; do
    case "${imported_dll,,}" in
      api-ms-win-crt-*.dll|avicap32.dll|crypt32.dll|gdi32.dll|kernel32.dll|ncrypt.dll|ole32.dll|oleaut32.dll|secur32.dll|shell32.dll|shlwapi.dll|user32.dll|ws2_32.dll)
        ;;
      *)
        fail "unexpected non-system DLL import in $executable: $imported_dll"
        ;;
    esac
  done
done

FFMPEG_SHA256="$(sha256sum "$OUTPUT_DIR/ffmpeg.exe" | awk '{print $1}')"
FFPROBE_SHA256="$(sha256sum "$OUTPUT_DIR/ffprobe.exe" | awk '{print $1}')"

read_manifest_sha256() {
  python3 -c '
import json
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    manifest = json.load(handle)

for output in manifest["outputs"]:
    if output["path"] == sys.argv[2]:
        print(output["sha256"])
        break
else:
    raise SystemExit(f"output not recorded in manifest: {sys.argv[2]}")
' "$SCRIPT_DIR/ffmpeg-windows-source-inputs.json" "$1"
}

EXPECTED_FFMPEG_SHA256="$(read_manifest_sha256 'resources/tools/ffmpeg/ffmpeg.exe')"
EXPECTED_FFPROBE_SHA256="$(read_manifest_sha256 'resources/tools/ffmpeg/ffprobe.exe')"

[[ "$EXPECTED_FFMPEG_SHA256" =~ ^[0-9a-f]{64}$ ]] \
  || fail 'invalid ffmpeg.exe SHA-256 in ffmpeg-windows-source-inputs.json'
[[ "$EXPECTED_FFPROBE_SHA256" =~ ^[0-9a-f]{64}$ ]] \
  || fail 'invalid ffprobe.exe SHA-256 in ffmpeg-windows-source-inputs.json'
[[ "$FFMPEG_SHA256" == "$EXPECTED_FFMPEG_SHA256" ]] || \
  fail "ffmpeg.exe differs from the recorded build (expected $EXPECTED_FFMPEG_SHA256, got $FFMPEG_SHA256)"
[[ "$FFPROBE_SHA256" == "$EXPECTED_FFPROBE_SHA256" ]] || \
  fail "ffprobe.exe differs from the recorded build (expected $EXPECTED_FFPROBE_SHA256, got $FFPROBE_SHA256)"

if [[ "$INSTALL_TO_REPOSITORY" == 'true' ]]; then
  [[ -f "$REPOSITORY_ROOT/package.json" ]] \
    || fail '--install is only available from the WatchAlong repository'
  cp -- "$OUTPUT_DIR/ffmpeg.exe" "$REPOSITORY_ROOT/resources/tools/ffmpeg/ffmpeg.exe"
  cp -- "$OUTPUT_DIR/ffprobe.exe" "$REPOSITORY_ROOT/resources/tools/ffmpeg/ffprobe.exe"
fi

if [[ -f "$REPOSITORY_ROOT/package.json" ]]; then
  REPOSITORY_FFMPEG_SHA256="$(sha256sum "$REPOSITORY_ROOT/resources/tools/ffmpeg/ffmpeg.exe" | awk '{print $1}')"
  REPOSITORY_FFPROBE_SHA256="$(sha256sum "$REPOSITORY_ROOT/resources/tools/ffmpeg/ffprobe.exe" | awk '{print $1}')"
  [[ "$REPOSITORY_FFMPEG_SHA256" == "$EXPECTED_FFMPEG_SHA256" ]] || \
    fail "checked-in ffmpeg.exe differs from the manifest (expected $EXPECTED_FFMPEG_SHA256, got $REPOSITORY_FFMPEG_SHA256)"
  [[ "$REPOSITORY_FFPROBE_SHA256" == "$EXPECTED_FFPROBE_SHA256" ]] || \
    fail "checked-in ffprobe.exe differs from the manifest (expected $EXPECTED_FFPROBE_SHA256, got $REPOSITORY_FFPROBE_SHA256)"
fi

{
  printf 'WatchAlong Windows x64 FFmpeg build\n'
  printf 'FFmpeg version: %s\n' "$FFMPEG_VERSION"
  printf 'FFmpeg source SHA-256: %s\n' "$FFMPEG_SOURCE_SHA256"
  printf 'FFmpeg source signature: verified with %s\n' "$FFMPEG_SIGNING_KEY_FINGERPRINT"
  printf 'NASM version: %s\n' "$NASM_VERSION"
  printf 'NASM source SHA-256: %s\n' "$NASM_SOURCE_SHA256"
  printf 'llvm-mingw version: %s\n' "$LLVM_MINGW_VERSION"
  printf 'llvm-mingw archive SHA-256: %s\n' "$LLVM_MINGW_SHA256"
  printf 'SOURCE_DATE_EPOCH: %s\n' "$SOURCE_DATE_EPOCH"
  printf 'ffmpeg.exe SHA-256: %s\n' "$FFMPEG_SHA256"
  printf 'ffprobe.exe SHA-256: %s\n' "$FFPROBE_SHA256"
  printf '\nFFmpeg configuration:\n'
  printf '%s\n' "$FFMPEG_CONFIGURATION"
  for executable in ffmpeg.exe ffprobe.exe; do
    printf '\n%s imported Windows system libraries:\n' "$executable"
    "$TOOLCHAIN_DIR/bin/llvm-readobj" --coff-imports "$OUTPUT_DIR/$executable" \
      | awk '/Name:/ { print $2 }' \
      | sort -fu
  done
} > "$OUTPUT_DIR/BUILD-RESULTS.txt"

mkdir -p "$SOURCE_BUNDLE_ROOT"
cp -- "$FFMPEG_ARCHIVE" "$FFMPEG_SIGNATURE" "$FFMPEG_SIGNING_KEY" \
  "$NASM_ARCHIVE" "$SOURCE_BUNDLE_ROOT/"
cp -- "$SCRIPT_DIR/build-windows-ffmpeg.sh" \
  "$SCRIPT_DIR/ffmpeg-windows-source-inputs.json" \
  "$OUTPUT_DIR/BUILD-RESULTS.txt" "$SOURCE_BUNDLE_ROOT/"
cp -- "$FFMPEG_SOURCE_DIR/COPYING.GPLv2" \
  "$FFMPEG_SOURCE_DIR/COPYING.GPLv3" \
  "$FFMPEG_SOURCE_DIR/COPYING.LGPLv2.1" \
  "$FFMPEG_SOURCE_DIR/COPYING.LGPLv3" \
  "$SOURCE_BUNDLE_ROOT/"
cp -- "$FFMPEG_SOURCE_DIR/COPYING.LGPLv2.1" \
  "$SOURCE_BUNDLE_ROOT/FFMPEG_LGPL_2.1.txt"
{
  printf '# WatchAlong Windows x64 FFmpeg corresponding source\n\n'
  printf 'This archive corresponds to the FFmpeg binaries shipped by WatchAlong v%s:\n\n' "$WATCHALONG_VERSION"
  printf -- '- `resources/tools/ffmpeg/ffmpeg.exe`: `%s` (SHA-256)\n' "$FFMPEG_SHA256"
  printf -- '- `resources/tools/ffmpeg/ffprobe.exe`: `%s` (SHA-256)\n\n' "$FFPROBE_SHA256"
  printf 'The binaries are built from the signed, unmodified official FFmpeg %s source release. ' "$FFMPEG_VERSION"
  printf 'The build enables no GPL, nonfree, or third-party linked libraries and is distributed under LGPL-2.1-or-later. '
  printf 'Copies of FFmpeg\047s LGPL and GPL license texts are included here; '
  printf '`FFMPEG_LGPL_2.1.txt` is byte-identical to signed-source `COPYING.LGPLv2.1`.\n\n'
  printf 'The exact input URLs, hashes, signer fingerprint, and output mapping are in '
  printf '`ffmpeg-windows-source-inputs.json`. `BUILD-RESULTS.txt` records the configuration and imported system DLLs.\n\n'
  printf 'To rebuild on x86_64 Linux or WSL without downloading inputs again:\n\n'
  printf '```sh\n'
  printf 'mkdir -p work/downloads out\n'
  printf 'cp ffmpeg-%s.tar.xz ffmpeg-%s.tar.xz.asc ffmpeg-devel.asc nasm-%s.tar.xz work/downloads/\n' \
    "$FFMPEG_VERSION" "$FFMPEG_VERSION" "$NASM_VERSION"
  printf '# Place the llvm-mingw archive named in the manifest in work/downloads/.\n'
  printf 'bash build-windows-ffmpeg.sh --work-dir "$PWD/work" --output-dir "$PWD/out"\n'
  printf '```\n\n'
  printf 'The llvm-mingw archive is not copied into this source offer because it is a compiler binary, not linked program source; '
  printf 'the manifest pins its release URL, source commit, and SHA-256.\n'
} > "$SOURCE_BUNDLE_ROOT/README.md"
(
  cd "$SOURCE_BUNDLE_ROOT"
  sha256sum BUILD-RESULTS.txt README.md \
    COPYING.GPLv2 COPYING.GPLv3 COPYING.LGPLv2.1 COPYING.LGPLv3 FFMPEG_LGPL_2.1.txt \
    build-windows-ffmpeg.sh \
    ffmpeg-windows-source-inputs.json \
    "ffmpeg-$FFMPEG_VERSION.tar.xz" \
    "ffmpeg-$FFMPEG_VERSION.tar.xz.asc" \
    ffmpeg-devel.asc "nasm-$NASM_VERSION.tar.xz" \
    | sort -k2 > SHA256SUMS.txt
)

SOURCE_BUNDLE="$OUTPUT_DIR/$SOURCE_BUNDLE_BASENAME.tar.xz"
tar --sort=name --mtime="@$FFMPEG_SOURCE_DATE_EPOCH" \
  --owner=0 --group=0 --numeric-owner \
  -cJf "$SOURCE_BUNDLE" \
  -C "$(dirname "$SOURCE_BUNDLE_ROOT")" "$(basename "$SOURCE_BUNDLE_ROOT")"

printf '\nBuild complete.\n'
printf '  ffmpeg.exe: %s\n' "$FFMPEG_SHA256"
printf '  ffprobe.exe: %s\n' "$FFPROBE_SHA256"
printf '  source bundle: %s\n' "$SOURCE_BUNDLE"

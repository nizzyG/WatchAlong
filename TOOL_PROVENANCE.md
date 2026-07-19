# Bundled Tool Provenance

WatchAlong vendors its standalone media-tool executables so a release behaves predictably without downloading them after installation. This document records where each yt-dlp, FFmpeg, ffprobe, and Node.js executable came from and the SHA-256 digest of the exact file checked into this repository. JavaScript dependencies used by `patreon-dl` are pinned separately by its package lock.

`npm run verify:tool-provenance` reads the manifest below, discovers every executable in the managed tool directories, and hashes the files locally. It fails if a file is missing, unlisted, newly added without provenance, or different from its recorded digest. Verification never contacts the network.

## Integrity manifest

Keep the table formatting intact: it is the human-readable and machine-read source of truth for the offline verifier.

<!-- tool-integrity-manifest:start -->
| Repository path | Target | Version / build | Upstream artifact | SHA-256 |
|---|---|---|---|---|
| `resources/tools/yt-dlp/yt-dlp.exe` | Windows x64 | 2026.03.17 | [yt-dlp.exe](https://github.com/yt-dlp/yt-dlp/releases/download/2026.03.17/yt-dlp.exe) | `3db811b366b2da47337d2fcfdfe5bbd9a258dad3f350c54974f005df115a1545` |
| `resources/tools/yt-dlp/yt-dlp_macos` | macOS universal | 2026.03.17 | [yt-dlp_macos](https://github.com/yt-dlp/yt-dlp/releases/download/2026.03.17/yt-dlp_macos) | `e80c47b3ce712acee51d5e3d4eace2d181b44d38f1942c3a32e3c7ff53cd9ed5` |
| `resources/tools/ffmpeg/ffmpeg.exe` | Windows x64 | 8.1.2 WatchAlong minimal LGPL build | [official FFmpeg 8.1.2 source](https://ffmpeg.org/releases/ffmpeg-8.1.2.tar.xz) | `23f910c1845d46c47f55abc187a647c050052e747acf201c8910805efd33f467` |
| `resources/tools/ffmpeg/ffprobe.exe` | Windows x64 | 8.1.2 WatchAlong minimal LGPL build | [official FFmpeg 8.1.2 source](https://ffmpeg.org/releases/ffmpeg-8.1.2.tar.xz) | `a5beac2093a0f53bec9a554745c90e8fa95b2bdc3dc25c8952578e093e6d9e7d` |
| `resources/tools/ffmpeg/ffmpeg-darwin-x64` | macOS Intel | 8.1.2 | [Martin Riedl ffmpeg.zip](https://ffmpeg.martin-riedl.de/download/macos/amd64/1783018342_8.1.2/ffmpeg.zip) | `1ca59dda73668c59898a0b305afd8a88817a989187f222ec62d64e775d614d23` |
| `resources/tools/ffmpeg/ffprobe-darwin-x64` | macOS Intel | 8.1.2 | [Martin Riedl ffprobe.zip](https://ffmpeg.martin-riedl.de/download/macos/amd64/1783018342_8.1.2/ffprobe.zip) | `bdb6aff0f1f414382effd97040f7862dc85e67996ac296cb4288beed0e06498f` |
| `resources/tools/ffmpeg/ffmpeg-darwin-arm64` | macOS Apple Silicon | 8.1.2 | [Martin Riedl ffmpeg.zip](https://ffmpeg.martin-riedl.de/download/macos/arm64/1783011502_8.1.2/ffmpeg.zip) | `eaf91238e104dd0e262bc6510e25061855cc99a6955a721b0ac99660d58c473d` |
| `resources/tools/ffmpeg/ffprobe-darwin-arm64` | macOS Apple Silicon | 8.1.2 | [Martin Riedl ffprobe.zip](https://ffmpeg.martin-riedl.de/download/macos/arm64/1783011502_8.1.2/ffprobe.zip) | `ed9dc5871914b466b96b402c9ec0ba68ce4f836e72faa464b1b4e279835bd4a6` |
| `resources/tools/node/node.exe` | Windows x64 | 24.15.0 | [Node.js Windows x64 archive](https://nodejs.org/dist/v24.15.0/node-v24.15.0-win-x64.zip) | `3331e1ffe19874215472217c5e94f5a0c6d8e18c4ac7111d3937aa0ad5e9b4a5` |
| `resources/tools/node/node-darwin-x64` | macOS Intel | 24.16.0 | [Node.js macOS x64 archive](https://nodejs.org/dist/v24.16.0/node-v24.16.0-darwin-x64.tar.gz) | `47483a524a057d93e246bb0e63867e2b4d189810aef53a6978d9e708a3d0f453` |
| `resources/tools/node/node-darwin-arm64` | macOS Apple Silicon | 24.16.0 | [Node.js macOS arm64 archive](https://nodejs.org/dist/v24.16.0/node-v24.16.0-darwin-arm64.tar.gz) | `1ee75375e33b94fc34b3b19aede049e11dae90efb63b374dc96d6bdace70c4b8` |
<!-- tool-integrity-manifest:end -->

## Upstream retrieval audit (2026-07-15)

- Fresh downloads of the exact yt-dlp 2026.03.17 assets matched both checked-in hashes above.
- The Node.js 24.15.0 Windows archive and both 24.16.0 macOS archives matched Node's official `SHASUMS256.txt` files. Extracting them produced all three checked-in Node executables byte-for-byte.
- Fresh downloads of Martin Riedl's versioned macOS Intel and Apple Silicon 8.1.2 `ffmpeg.zip` and `ffprobe.zip` archives matched the distributor's published archive checksums. The four extracted executables exactly matched the checked-in hashes above. Their Mach-O load commands identify native x86_64 or arm64 executables with a macOS 12.0 deployment target, and list only macOS system frameworks and libraries. Their embedded FFmpeg configuration enables GPLv3 components but does not contain `--enable-nonfree`; the public build recipe used for this release family is commit [`bb1d6db29cee948f9685bcd69e6caf17d960662b`](https://git.martin-riedl.de/ffmpeg/build-script/commit/bb1d6db29cee948f9685bcd69e6caf17d960662b).
- The Windows x64 tools were built locally from FFmpeg's signed, unmodified 8.1.2 release (signer fingerprint `FCF986EA15E6E293A5644F10B4322F04D67658D8`) with the pinned recipe and inputs in `scripts/build-windows-ffmpeg.sh` and `scripts/ffmpeg-windows-source-inputs.json`. The recipe disables autodetection, links no third-party libraries, rejects GPL/nonfree configurations and non-system DLL imports, and fixes the PE timestamp. Independent clean builds at different paths produced both checked-in files byte-for-byte. The exact app FFprobe and raw-frame extraction commands passed against real MKV and MP4 files, as did a representative stream-copy remux.

## Update procedure

1. Download a release only from the upstream project or the build distributor named above.
2. Confirm its version and licensing, reject any FFmpeg/ffprobe build containing `--enable-nonfree`, replace the intended repository file, and update `THIRD_PARTY_NOTICES.md` if either changed.
3. Calculate the file's SHA-256 independently (`Get-FileHash -Algorithm SHA256` on Windows or `shasum -a 256` on macOS).
4. Update that file's row here, then run `npm run verify:tool-provenance` and `npm run test:tool-provenance` before packaging.

The digest proves that a checked-in tool has not changed since this manifest was reviewed. It does not replace code signing by an upstream publisher or independent review of the binary.

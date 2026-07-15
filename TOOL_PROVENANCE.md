# Bundled Tool Provenance

WatchAlong vendors its standalone media-tool executables so a release behaves predictably without downloading them after installation. This document records where each yt-dlp, FFmpeg, ffprobe, and Node.js executable came from and the SHA-256 digest of the exact file checked into this repository. JavaScript dependencies used by `patreon-dl` are pinned separately by its package lock.

`npm run verify:tool-provenance` reads the manifest below, discovers every executable in the managed tool directories, and hashes the files locally. It fails if a file is missing, unlisted, newly added without provenance, or different from its recorded digest. Verification never contacts the network.

The standalone `yt-dlp_macos` at the repository root is a legacy development mirror. It is not copied into release packages, but it remains covered by the integrity check while it exists. The packaged copy is `resources/tools/yt-dlp/yt-dlp_macos`; both files are byte-identical.

## Integrity manifest

Keep the table formatting intact: it is the human-readable and machine-read source of truth for the offline verifier.

<!-- tool-integrity-manifest:start -->
| Repository path | Target | Version / build | Upstream artifact | SHA-256 |
|---|---|---|---|---|
| `resources/tools/yt-dlp/yt-dlp.exe` | Windows x64 | 2026.03.17 | [yt-dlp.exe](https://github.com/yt-dlp/yt-dlp/releases/download/2026.03.17/yt-dlp.exe) | `3db811b366b2da47337d2fcfdfe5bbd9a258dad3f350c54974f005df115a1545` |
| `resources/tools/yt-dlp/yt-dlp_macos` | macOS universal | 2026.03.17 | [yt-dlp_macos](https://github.com/yt-dlp/yt-dlp/releases/download/2026.03.17/yt-dlp_macos) | `e80c47b3ce712acee51d5e3d4eace2d181b44d38f1942c3a32e3c7ff53cd9ed5` |
| `resources/tools/ffmpeg/ffmpeg.exe` | Windows x64 | 8.1.1 full build | [Gyan ffmpeg-8.1.1-full_build.7z](https://github.com/GyanD/codexffmpeg/releases/download/8.1.1/ffmpeg-8.1.1-full_build.7z) | `09948d4cdd0650da6ff5a87577469f2a218dc2615ae379f8f734d24c49de0f73` |
| `resources/tools/ffmpeg/ffprobe.exe` | Windows x64 | 8.1.1 full build | [Gyan ffmpeg-8.1.1-full_build.7z](https://github.com/GyanD/codexffmpeg/releases/download/8.1.1/ffmpeg-8.1.1-full_build.7z) | `a6618e99bb58869ded3c6f37b53aa1a8d701c3591dbb7b5b317d47369c112be2` |
| `resources/tools/ffmpeg/ffmpeg-darwin-x64` | macOS Intel | 8.1.1-tessus | [Evermeet ffmpeg-8.1.1.7z](https://evermeet.cx/ffmpeg/ffmpeg-8.1.1.7z) | `3a0ea97adddecfbf87b865da3bcbb321edfce4bab18a98ae1ba4ba9f0bd1f93a` |
| `resources/tools/ffmpeg/ffprobe-darwin-x64` | macOS Intel | 8.0 | [OSXExperts ffprobe80intel.zip](https://www.osxexperts.net/ffprobe80intel.zip) | `5228e651e2bd67bb55819b27f6138351587b16d2b87446007bf35b7cf930d891` |
| `resources/tools/ffmpeg/ffmpeg-darwin-arm64` | macOS Apple Silicon | 6.0 | [OSXExperts ffmpeg6arm.zip](https://www.osxexperts.net/ffmpeg6arm.zip) | `a90e3db6a3fd35f6074b013f948b1aa45b31c6375489d39e572bea3f18336584` |
| `resources/tools/ffmpeg/ffprobe-darwin-arm64` | macOS Apple Silicon | 8.1 | [OSXExperts ffprobe81arm.zip](https://www.osxexperts.net/ffprobe81arm.zip) | `aab17ac7379c1178aaf400c3ef36cdb67db0b75b1a23eeef2cb9f658be8844e6` |
| `resources/tools/node/node.exe` | Windows x64 | 24.15.0 | [Node.js Windows x64 archive](https://nodejs.org/dist/v24.15.0/node-v24.15.0-win-x64.zip) | `3331e1ffe19874215472217c5e94f5a0c6d8e18c4ac7111d3937aa0ad5e9b4a5` |
| `resources/tools/node/node-darwin-x64` | macOS Intel | 24.16.0 | [Node.js macOS x64 archive](https://nodejs.org/dist/v24.16.0/node-v24.16.0-darwin-x64.tar.gz) | `47483a524a057d93e246bb0e63867e2b4d189810aef53a6978d9e708a3d0f453` |
| `resources/tools/node/node-darwin-arm64` | macOS Apple Silicon | 24.16.0 | [Node.js macOS arm64 archive](https://nodejs.org/dist/v24.16.0/node-v24.16.0-darwin-arm64.tar.gz) | `1ee75375e33b94fc34b3b19aede049e11dae90efb63b374dc96d6bdace70c4b8` |
| `yt-dlp_macos` | Legacy unbundled mirror | 2026.03.17 | [yt-dlp_macos](https://github.com/yt-dlp/yt-dlp/releases/download/2026.03.17/yt-dlp_macos) | `e80c47b3ce712acee51d5e3d4eace2d181b44d38f1942c3a32e3c7ff53cd9ed5` |
<!-- tool-integrity-manifest:end -->

## Upstream retrieval audit (2026-07-15)

- Fresh downloads of the exact yt-dlp 2026.03.17 assets matched both checked-in hashes above.
- The Node.js 24.15.0 Windows archive and both 24.16.0 macOS archives matched Node's official `SHASUMS256.txt` files. Extracting them produced all three checked-in Node executables byte-for-byte.
- Evermeet still retains the versioned `ffmpeg-8.1.1.7z` archive (and its detached `.sig`). A fresh download was extracted during this audit; its `ffmpeg` binary exactly matched `resources/tools/ffmpeg/ffmpeg-darwin-x64` at SHA-256 `3a0ea97adddecfbf87b865da3bcbb321edfce4bab18a98ae1ba4ba9f0bd1f93a`.
- Fresh downloads of OSXExperts' `ffmpeg6arm.zip`, `ffprobe80intel.zip`, and `ffprobe81arm.zip` extracted to binaries that exactly matched all three checked-in hashes above. The filenames and version labels are the distributor's own naming.
- A fresh download of Gyan's exact GitHub release archive for 8.1.1 produced `ffmpeg.exe` and `ffprobe.exe` files that exactly matched both checked-in Windows hashes above. The executables also self-report `8.1.1-full_build-www.gyan.dev`. The much less specific `ffmpeg-release-full.7z` URL is deliberately not used here because it is a rolling alias that has already advanced to 8.1.2.

## Update procedure

1. Download a release only from the upstream project or the build distributor named above.
2. Confirm its version and licensing, replace the intended repository file, and update `THIRD_PARTY_NOTICES.md` if either changed.
3. Calculate the file's SHA-256 independently (`Get-FileHash -Algorithm SHA256` on Windows or `shasum -a 256` on macOS).
4. Update that file's row here, then run `npm run verify:tool-provenance` and `npm run test:tool-provenance` before packaging.

The digest proves that a checked-in tool has not changed since this manifest was reviewed. It does not replace code signing by an upstream publisher or independent review of the binary.

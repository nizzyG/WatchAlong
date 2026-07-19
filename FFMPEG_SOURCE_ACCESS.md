# FFmpeg Corresponding Source Access

WatchAlong includes FFmpeg and ffprobe executables. This document travels inside the app and is also published beside every installer.

Complete machine-readable Corresponding Source is provided at no charge as two archives in the same GitHub release:

- `WatchAlong-vX.Y.Z-ffmpeg-corresponding-source-windows-x64-8.1.2.tar.xz`
- `WatchAlong-vX.Y.Z-ffmpeg-corresponding-source-macos-8.1.2.tar.xz`

Replace `vX.Y.Z` with the release version shown on that page. Both source archives are covered by the release's `SHA256SUMS.txt`. These same-release assets, rather than the reference links below, are WatchAlong's source-delivery mechanism. They will remain available for as long as the corresponding installers are offered.

## Windows x64: FFmpeg and ffprobe 8.1.2

The Windows executables are WatchAlong builds of the unmodified, signed [FFmpeg 8.1.2 source release](https://ffmpeg.org/releases/ffmpeg-8.1.2.tar.xz). They are built without external codec libraries and are distributed under [GNU LGPL 2.1 or later](https://www.gnu.org/licenses/old-licenses/lgpl-2.1.html).

The Windows source archive contains the exact FFmpeg release source and signature, the pinned build recipe, build-tool source and provenance, the build configuration, license materials, and a manifest mapping those materials to the shipped executable SHA-256 values. The public recipe is also kept at `scripts/build-windows-ffmpeg.sh` in the WatchAlong repository.

## macOS Intel and Apple Silicon: FFmpeg and ffprobe 8.1.2

Both macOS architectures use native FFmpeg and ffprobe 8.1.2 executables from [Martin Riedl's public FFmpeg build service](https://ffmpeg.martin-riedl.de/). They enable GPLv3 components, do not enable FFmpeg's nonfree mode, and are distributed under [GNU GPL 3.0 or later](https://www.gnu.org/licenses/gpl-3.0.html).

The macOS source archive covers both architectures. It contains the exact FFmpeg source; source for every statically linked non-system library; the release recipe in effect for the upstream 8.1.2 build family; the Intel and Apple Silicon build reports; the exact x264 revision current for both upstream builds; vendored rav1e Cargo dependencies verified for offline resolution; license materials; and a manifest mapping the source set to all four shipped executable SHA-256 values.

The corresponding upstream object-code records remain available for comparison:

- [macOS Intel build 1783018342_8.1.2](https://ffmpeg.martin-riedl.de/info/detail/macos/amd64/1783018342_8.1.2)
- [macOS Apple Silicon build 1783011502_8.1.2](https://ffmpeg.martin-riedl.de/info/detail/macos/arm64/1783011502_8.1.2)

## Verification and continued access

The exact executable digests and original binary download locations are recorded in the companion `TOOL_PROVENANCE.md` release asset. The full GPLv3 text is included in `THIRD_PARTY_NOTICES.md`; the verbatim LGPL 2.1 text for the Windows build is included as `FFMPEG_LGPL_2.1.txt`.

If a source asset or link becomes unavailable, report it at `watchalong@pm.me` so the public source path can be restored. Email is a support path, not a substitute for the no-charge source archives published with each installer.

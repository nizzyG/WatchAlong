# Tool Resource Layout

Packaged builds copy this directory to `process.resourcesPath/tools`.

Expected layout:

```text
resources/tools/
  yt-dlp/
    yt-dlp.exe (Windows)
    yt-dlp_macos (macOS)
  ffmpeg/
    ffmpeg.exe (Windows)
    ffmpeg-darwin-arm64 (macOS Apple Silicon)
    ffmpeg-darwin-x64 (macOS Intel)
  node/
    node.exe (Windows)
    node-darwin-arm64 (macOS Apple Silicon)
    node-darwin-x64 (macOS Intel)
  patreon-dl/
    node_modules/patreon-dl/bin/patreon-dl.js
    node_modules/patreon-dl/dist/...
    node_modules/...
```

During local development the app resolves tools from this directory. Packaged
builds resolve the same layout under Electron's resources directory.

The upstream acquisition source and SHA-256 digest for every standalone
yt-dlp, FFmpeg, ffprobe, and Node.js executable are recorded in
`TOOL_PROVENANCE.md` at the repository root. Run
`npm run verify:tool-provenance` before packaging; the build runs this offline
check automatically.

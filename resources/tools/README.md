# Tool Resource Layout

Packaged builds copy this directory to `process.resourcesPath/tools`.

Expected layout:

```text
resources/tools/
  yt-dlp/
    yt-dlp.exe or yt-dlp.cmd
  ffmpeg/
    ffmpeg.exe
  node/
    node.exe
  patreon-dl/
    node_modules/patreon-dl/bin/patreon-dl.js
    node_modules/patreon-dl/dist/...
    node_modules/...
```

During local development the app resolves tools from this directory. Packaged
builds resolve the same layout under Electron's resources directory.

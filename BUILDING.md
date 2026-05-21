# Building WatchAlong

## Prerequisites

- Node.js and npm compatible with the root `package-lock.json`.
- Git LFS for bundled tool binaries.
- On Windows, an elevated terminal or a CI runner for packaging.

## Local Build

Install dependencies from the repository root:

```bash
npm install
```

The root install also runs `npm ci --prefix resources/tools/patreon-dl` so the bundled Patreon downloader has its own reproducible dependency tree.

Build the app:

```bash
npm run build
```

## Packaging

Create a distributable package:

```bash
npm run dist
```

On Windows, run `npm run build` and then `npm run dist` from an Administrator terminal, or run packaging on a CI runner. `electron-builder` may fail to extract its `winCodeSign-2.6.0.7z` helper without Windows symlink privileges.

Code signing is currently skipped for local builds, and WatchAlong currently uses Electron's default app icon.

## Verification

Before publishing a release, run:

```bash
npm test
npm run typecheck
npm run build
npm run dist
```

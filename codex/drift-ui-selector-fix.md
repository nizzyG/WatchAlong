# Auto-detect movie frame rate + Reactor Source selector

## Summary
Replace the manual rate preset buttons with automatic frame rate detection using the bundled ffprobe. The user picks the reactor's source type (Streaming/NTSC/PAL), and the app computes the correct rate correction automatically. Kills the frame rate guessing game entirely.

## Key Changes
- Add `ReactorSource` type and `detectedMovieFps` field to shared types and LibrarySession.
- Add `getFfprobePath()` to ToolResolver in mediaServices.ts.
- Add IPC handler `detect-movie-frame-rate` in main/index.ts that runs ffprobe and parses the result.
- Add `detectMovieFrameRate` to the WatchAlongApi interface in types.ts.
- Replace the three rate preset buttons in App.tsx with a Reactor Source segmented control.
- Compute movieRateCorrection from detectedMovieFps / reactorSourceFps automatically.

## Requirements

### Types and session model
1. Add `ReactorSource = 'streaming' | 'ntsc' | 'pal'` to shared/types.ts.
2. Add `reactorSource: ReactorSource` to LibrarySession — defaults to 'streaming' for existing sessions.
3. Add `detectedMovieFps: number | null` to LibrarySession — null means not yet detected or detection failed.
4. The reactor source FPS mapping is: streaming = 24, ntsc = 24000/1001, pal = 25.

### Frame rate detection (main process)
5. Add `getFfprobePath()` to ToolResolver — same directory as ffmpeg, platform-specific filename.
6. New IPC channel `detect-movie-frame-rate` accepts a moviePath string and returns a number or null.
7. The handler runs the bundled ffprobe: `ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate -of csv=p=0 <path>`.
8. Parse ffprobe output: "25/1" becomes 25, "24000/1001" becomes 23.976, "24/1" becomes 24. Round to 3 decimal places.
9. If ffprobe fails, exits non-zero, produces unparseable output, or the file doesn't exist: return null.
10. Timeout the ffprobe call at 10 seconds.

### Renderer integration
11. When a session is loaded and moviePath is set but detectedMovieFps is null, call detectMovieFrameRate and store the result.
12. Do NOT re-detect on every render — only when moviePath changes or detectedMovieFps is null.
13. Compute movieRateCorrection as detectedMovieFps / reactorSourceFps when both are available. Clamp result to [0.9, 1.1].
14. When detection fails (detectedMovieFps is null), show the existing three manual rate preset buttons as fallback.
15. When the user changes reactor source mid-playback, recompute rate correction preserving the current sync point — same behavior as changing a rate preset today.

### UI
16. Replace the three rate preset buttons with a segmented control labeled "Reactor source" containing three segments: Streaming, NTSC, PAL.
17. When detection succeeds, show the detected movie FPS and the computed correction rate as read-only text below the selector.
18. When detection fails or hasn't run yet, hide the computed rate info and show the manual presets instead.
19. Keep the existing `formatRatePercent` and `formatRateDriftPerHour` display helpers for the computed rate.

## Test Plan
- `npm run typecheck` passes.
- `npm test` passes. Existing tests for setMovieRateCorrection and the rate preset UI will need updating.
- New unit test for ffprobe output parsing: "25/1" → 25, "24000/1001" → 23.976, "30000/1001" → 29.97, "24/1" → 24, empty string → null, garbage → null.
- Verify a session with detectedMovieFps=25 and reactorSource='pal' computes correction 1.0.
- Verify a session with detectedMovieFps=25 and reactorSource='streaming' computes correction 1.042.
- Verify a session with detectedMovieFps=null shows the manual rate preset fallback.

## Assumptions
- ffprobe is in the same directory as the bundled ffmpeg. Use getPlatformToolFilename for the 'ffprobe' name.
- r_frame_rate is the correct field — it gives the "real" base rate even for VFR files. Do not use avg_frame_rate.
- Detection runs once per movie load, not continuously. It's an explicit IPC call, not a watcher.
- The reactor source field is session-scoped, not a global preference. Different reactors may use different sources.
- When moviePath is null (no movie loaded), skip detection entirely.
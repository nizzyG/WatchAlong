# Audio Track Selection — Feature Scope (v1.3)

**From:** Executive Studio Coordinator
**To:** Senior Codesmith (Sol) — for awareness, not immediate work
**Branch:** `codex/v1.2-qol`
**Status:** v1.3 feature. Documented now so it's not forgotten.

---

## The problem

MKV and other containers often carry multiple audio tracks — original language, dub, commentary, etc. Chromium's `<video>` element defaults to the first track, which is frequently not the one the user wants. The Creative Director's copy of The Raid defaulted to the English dub instead of the original Indonesian audio.

## What's needed

An audio track selector in the player. The user should be able to see available audio tracks for the current movie file and switch between them. The selection should persist with the session.

## The challenge

Chromium's `HTMLVideoElement.audioTracks` API is inconsistent — it exists in spec but support varies by container format and codec. MKV support in particular is spotty for audio track enumeration via the HTML media API. This may require a different approach (ffprobe to enumerate tracks, then a mechanism to select which one plays — potentially involving ffmpeg remuxing or a different playback approach for multi-track MKV).

This is a real feature with real engineering complexity. Scope it for v1.3 alongside the other deferred items (companion app, etc.). Don't rush it into v1.2.

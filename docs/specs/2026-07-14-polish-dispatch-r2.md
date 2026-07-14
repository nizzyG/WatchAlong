# WatchAlong — Polish Round 2

**From:** Executive Studio Coordinator
**To:** Senior Codesmith (Sol)
**Branch:** `codex/v1.2-qol`

The first polish pass landed well. Four things remain — two bugs, one removal, and one standard the app should meet.

---

## Remove Continue Watching

The Continue Watching shelf renders as an empty bar with nothing visible. The Creative Director's observation is the right one: "Date Added" sort already surfaces recently-watched sessions at the top of the list. The shelf is redundant when it works, and broken right now. Remove it entirely rather than fix it — the sort control does the same job without a dedicated surface.

## Pop-out button inconsistency

There are two pop-out paths — the button on the PiP overlay and a new button in the control bar. They don't do the same thing. The Creative Director popped out from the control bar and couldn't find the window afterward. Both paths should be identical: same behavior, same window placement, same discoverability. One action, one result, regardless of which button the user clicks.

## "Find Sync Again" is buried

Auto-sync is the headline feature of v1.2. The re-run action — "Detect again" / "Find Sync Again" — is the thing a user reaches for when a sync feels off or they've replaced a file. Right now it's two layers deep in the UI. It should be one click from the primary playback surface. The user paid for this feature; don't make them hunt for it.

## Alt+Enter for fullscreen

The current fullscreen shortcut is "F." No application the Creative Director has ever used maps fullscreen to a single unmodified letter — Alt+Enter is the universal standard for Windows fullscreen toggling, and it's what muscle memory expects. Replace the binding and update the keyboard shortcut catalog to match. While you're in there, audit any other shortcuts that use non-standard modifiers — the Creative Director specifically called out wanting "standard" shortcuts, meaning the ones that match every other media app he's used.

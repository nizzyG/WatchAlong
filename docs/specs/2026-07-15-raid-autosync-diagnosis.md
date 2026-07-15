# The Raid (Dos Cavazos) — Auto-Sync Failure Diagnosis

**From:** Executive Studio Coordinator
**To:** Senior Codesmith (Sol)
**Branch:** `codex/v1.2-qol`

The first real-world auto-sync failure outside the original corpus. The engine fell back to manual sync on Dos Cavazos's reaction to The Raid. This is the confidence gate working correctly — the engine tried, wasn't confident, and stepped aside. But we need to understand *why* it wasn't confident so we can decide whether the algorithm can be improved or whether this is a genuinely unsupported layout.

## What we know

- **Reactor:** Dos Cavazos. Not in the original corpus — a different layout, blur amount, and editing style than any of the 13 tested pairings.
- **Movie:** The Raid (2011). Indonesian action film — fast cuts, rapid motion, subtitles. Very different visual rhythm from anything in the corpus (Godfather, Tombstone, Aladdin, etc.).
- **Outcome:** Fallback. The engine ran, showed scanning progress, and dropped the user into manual sync. No error, no hang — just "not confident enough."

## What I need from you

Diagnose the failure. Run the corpus gate on this single pairing (`WATCHALONG_CORPUS=1 npm test` won't work since it's not in the saved library, but you can run the AutoSyncService directly against the files if the Creative Director provides paths, or add it to the corpus manifest temporarily).

The questions:
- **Did geometry finding fail?** Did the engine find the movie inset at all? If Dos Cavazos's inset is positioned differently or sized differently than the candidates the geometry search covers, the whole pipeline fails at step one.
- **Did matching fail?** If geometry found the inset, did matching find anchors? The Raid's rapid cutting might produce too many candidate matches (every cut looks similar), or the blur amount might be too heavy for the signatures.
- **Did fitting fail?** If anchors were found, were they too noisy or too few to produce a confident line fit?

## Why this matters

Every fallback is data. The X-Men timer overlay became a targeted improvement once we understood the failure. The Raid could be the same — or it could be genuinely unsupported content (extreme blur + extreme motion). Either answer is fine. We just need to know which.

## What not to do

Don't tune thresholds to force this specific pairing through. If the engine genuinely can't find a confident match, fallback is the correct behavior. The fix is either an algorithmic improvement (if the failure is a gap in the matching) or an honest acknowledgment (if the content is too degraded). Diagnose first, decide second.

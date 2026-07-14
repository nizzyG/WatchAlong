# WatchAlong — Wood Texture Follow-Up

**From:** Executive Studio Coordinator
**To:** Senior Codesmith (Sol)
**Branch:** `codex/v1.2-qol`

The toggle is perfect — `data-cabinet` is exactly the right name. The Mahogany and Oak color tones both look great. The one thing that needs more work is the grain texture. It's barely noticeable.

## The diagnosis

The current approach uses two `repeating-linear-gradient` layers at 88° and 92° with extremely low opacities (`0.012` light, `0.035` dark). Two problems:

1. **The opacities are too low.** `0.012` is essentially invisible. The grain needs to be clearly perceptible — "you feel it more than you see it" doesn't mean "you can't see it at all."

2. **Repeating gradients produce perfectly regular stripes.** Real wood grain is irregular — varying spacing, varying intensity, organic curves, knots and figure. Perfectly spaced parallel lines at a fixed angle read as a technical pattern, not as wood grain.

## What to try

The Creative Director wants the texture to be more noticeable and more wood-like. The method is yours to choose — CSS, SVG filters, a combination — but the result should read as genuine wood grain, not as a subtle stripe pattern. Increase the contrast of the grain lines. Add irregularity. Let the grain have character the way real wood does.

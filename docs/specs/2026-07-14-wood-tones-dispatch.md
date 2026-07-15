# WatchAlong — Wood Tones

**From:** Executive Studio Coordinator
**To:** Senior Codesmith (Sol)
**Branch:** `codex/v1.2-qol`

The warm-neutral palette got us close. The finishing touch is making it specific. The app doesn't have a "dark mode" and a "light mode." It has two cabinets — **Mahogany** and **Oak** — in the same family room.

---

## The memory

The Creative Director grew up with a light-toned oak entertainment center with glass-door cabinets. Years later, his dad built a grander one for their new house, stained dark mahogany. Two cabinets. Same family. Same purpose — holding the media they owned and the equipment they watched it on. Different wood.

That's the app's two modes. Not a clinical dark/light toggle. A choice between two pieces of real furniture, both warm, both hand-built, both unmistakably *physical* in a way no SaaS gradient has ever been.

## What the current palette is missing

The warm tokens (`--wa-ink`, `--wa-paper`, the amber and aluminum accents) work. They're the right direction. But they read as "warm dark mode" — a generic warm dark, not a *specific* warm dark. Nobody looks at `#15130f` and thinks "mahogany." They think "dark theme with slightly warm undertones."

Wood is specific. Mahogany has a deep reddish-brown richness that reads as substantial and lived-in. Oak has a pale, tight-grained warmth that reads as natural and airy. Both are unmistakably wood — a material you can feel under your hands, that ages beautifully, that someone chose and stained and built with. That specificity is what the current palette lacks.

## The two modes

**Mahogany** (dark): deep reddish-brown base tones. Warm amber accents that glow against the dark wood like the pilot lights on old audio equipment. Cream text that sits on the surface the way a label sits on a tape. This is the den — lights dimmed, movie on, the cabinet holding everything you own.

**Oak** (light): pale warm wood base. Softer amber accents against the lighter grain. Dark brown text, like ink stamped into light wood. This is the living room — afternoon light through the windows, the cabinet bright and open, the glass doors showing your collection.

The green accent (`#8ee2b1`) is the VCR's power LED. It stays in both modes — a small, bright constant that reads clearly for the Creative Director's deuteranopia.

## Deuteranopia

Wood tones live on the yellow-blue luminance axis. The mahogany/oak distinction is lightness, not hue — and deuteranopic vision handles lightness contrast normally. The amber, cream, and green palette is inherently safe across both modes. No special accommodation needed; the constraint is satisfied by the material choice itself.

## The toggle

A mode switch in the Command Panel and Preferences — "Mahogany" and "Oak" as the labels, not "Dark" and "Light." Default to the user's system preference (`prefers-color-scheme`), with manual override that persists. If the system changes, follow it unless the user has chosen explicitly.

## What stays

Everything. The layout, the poster-forward library, the depth and transparency, the component architecture. This is a token swap — the wood tones replace the generic warm-neutral values. The shapes, the depth, the structure all carry over unchanged. We're staining the same cabinet a different color, not building a new one.

Make the wood feel like wood — not just the right color, but the right *surface*. Subtle grain texture on panel backgrounds, generated via CSS (layered gradients or a tiled SVG pattern, not raster images). The grain should be barely perceptible — present enough that the eye registers "this is a material, not a flat color" without competing with the content. Think of the way real furniture catches light: the grain is there, you feel it more than you see it, and it's what tells you this is wood and not painted MDF.

This is what separates a mahogany cabinet from a brown rectangle.

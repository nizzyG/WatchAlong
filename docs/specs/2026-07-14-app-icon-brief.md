# WatchAlong App Icon — Creative Brief

**Status:** Direction agreed with Creative Director, 2026-07-14.

---

## The concept

A VHS tape, viewed face-on, with a generic white label sticker. The label has "Watch Along" handwritten on it in blue ballpoint pen ink — one word per line, slightly imperfect, the way a person actually writes on a tape label.

## Why

The VHS tape is the entire design thesis in one image: media ownership, the 90s living room, something you held and labeled and shelved. The handwritten label is the personal, human, anti-corporate touch — not a logo designed by a branding agency, but a label written by the person who owns the tape.

## Detailed visual spec

### The tape

- A standard VHS cassette, viewed from the front (the side with the label and the window)
- The tape body is dark — charcoal or near-black, slightly warm (not pure black, not blue-black). Think of a real VHS shell: dark grey-brown plastic.
- The circular reel hubs visible through the window, if shown. Subtle, not distracting.
- The tape should fill most of the frame. It's the hero. Minimal or no background — transparent or a single warm dark tone.

### The label

- A standard white rectangular VHS label sticker, positioned in the upper-center of the tape face (where labels actually go)
- Slightly off-center or very slightly tilted — not perfectly straight. Real labels are applied by hand.
- The label is white or cream, not pure white. A little warmth, like paper that's been sitting in a cabinet.

### The handwriting

- "Watch" on the first line, "Along" on the second line
- Written in blue ballpoint pen ink — that specific medium-blue with slight pressure variation
- The handwriting should look genuinely handwritten, not a font imitating handwriting. Slightly imperfect letter spacing, natural line weight variation from pen pressure.
- Casual but legible. The kind of handwriting someone uses when labeling a tape they're filing on their shelf.

### Color

- Tape body: warm dark grey-brown (#2a2520 to #353028 range)
- Label: warm cream-white (#f0ead6 to #f4eede range)
- Handwriting: blue ballpoint ink (#2a4a8a to #3a5a9a range — a medium blue, not navy, not sky)
- Background: transparent

### Sizes needed

The icon must work at:
- **512×512** — installer graphic, app store listing
- **256×256** — about dialog, large UI surfaces
- **64×64** — taskbar / dock (handwriting may become illegible; the VHS silhouette carries it)
- **32×32** — small taskbar
- **16×16** — favicon (just the VHS silhouette with a blue-on-white blob for the label)

At small sizes, the VHS shape is the identifier. At large sizes, the handwritten label is the personality. Both must read clearly at their respective scales.

### Deuteranopia note

The blue-on-white label is high-contrast for all color vision types, including deuteranopia. The warm dark tape body against the cream label is also deuteranopia-safe. No red-green reliance anywhere in the icon.

### Platform formats

- **Windows:** `.ico` file containing 16, 32, 48, 64, 128, 256 sizes
- **macOS:** `.icns` file containing 16, 32, 64, 128, 256, 512, 1024 sizes (with `@2x` variants)
- **Linux:** 512×512 `.png`
- **Favicon:** 16×16 and 32×32 `.png` for the renderer

### What to avoid

- No film strip motifs. This is VHS, not film.
- No play button overlays. The tape IS the media; no UI chrome on the icon.
- No streaming-service aesthetics. No gradients, no glass, no corporate polish.
- No retro pastiche borders or "vintage filter" effects. The tape should look like a real object, not a nostalgia filter.
- No perfection. The handwritten label is the whole point — it should look human.

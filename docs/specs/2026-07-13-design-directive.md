# WatchAlong Design Directive

**From:** Executive Studio Coordinator
**To:** Senior Codesmith (Sol)
**Purpose:** Give you the values and the vocabulary for the visual identity. Not the pixels.

---

## What WatchAlong is

A local-first desktop app for a specific community: people who own their media and support creators on Patreon. It syncs a movie you own with a full-length reaction from a creator you pay. No streaming service in the middle. No telemetry. No account. No server.

The auto-sync engine works. The sync holds. The technical foundation is done. What's missing is a visual identity that signals *what this app stands for* before the user reads a single word of copy.

## The position: pro-consumer, anti-corporate

The Creative Director's instinct — and it's the right one — is that WatchAlong should look like it's *on the user's side.* Not neutral. Not the polished-but-anonymous dark theme that every Electron app ships with. Something that carries a position.

Here is what that position is, in plain language:

**You own your media. The streaming services rent it to you.** WatchAlong is built for ownership. The app should feel like a tool that respects the user's autonomy — their files, their data, their choices — not a service that happens to run locally while still treating the user as a tenant.

**You pay the creator directly. No middleman takes a cut.** The app should feel like it's part of the creator economy, not the attention economy. It exists to make the relationship between supporter and creator smoother, not to insert itself between them.

**No ads. No tracking. No account. No "engagement."** The app should feel trustworthy by design. Every screen communicates "this is yours" — not "this is ours, and we're letting you use it."

## What that looks like (the values, not the pixels)

I'm not going to give you a color palette or a font. You're better at finding the visual language for a position than I am. But I'll give you the *values* the visual language needs to carry, and the *anti-values* it needs to reject.

### The visual language should feel:

- **Owned, not rented.** Like a well-made physical object — a leather notebook, a steel tool, a film camera. Things that don't update themselves, don't A/B test your attention, don't have a "premium tier." The app should feel like something you possess, not something you subscribe to.

- **Honest, not glossy.** The current theme is a polished dark glass aesthetic. That's competent, but it's the default register of every startup SaaS dashboard. It doesn't signal anything. The new language can still be dark — but it should feel *made*, not *generated.* Consider: texture, weight, edges that feel intentional rather than rounded-into-oblivion. Consider whether "glassy and translucent" is the right metaphor for an app whose whole thesis is that things should be solid and yours.

- **Independent, not corporate.** Think about the visual difference between a streaming service's app (smooth, branded, animated logos, recommendation carousels, engagement dark patterns) and an independent creator's tool (opinionated, a little weird, built with conviction, not afraid to look different). WatchAlong is the second one. The design should signal "a person made this for a community" — not "a company made this for a market."

- **Warm, not sterile.** The current palette is cool blue-grey on near-black. That reads as "tech product." The community this app serves is warm — people who love film, who support artists, who watch reactions because they love seeing someone experience a story for the first time. The visual language can carry that warmth without becoming saccharine.

### The visual language should NOT feel:

- Like a streaming service. No carousels, no "recommended for you," no autoplay trailers, no gradient brand washes.
- Like a SaaS dashboard. No "analytics," no "insights," no empty-state illustrations that look like every onboarding flow.
- Like it's asking for something. No upgrade prompts, no "rate us," no notification badges, no engagement hooks.
- Like it's temporary. No "loading..." spinners that feel like the app is reaching out to a server. Everything is local. Everything is instant or clearly working.

## The anti-reference set

Sometimes it's easier to know what you want by knowing what you don't. Here are apps whose visual language is the *opposite* of what WatchAlong should be:

- Netflix, Disney+, Max — the streaming-service aesthetic. Branded, glossy, engagement-optimized.
- Notion, Linear, Vercel — the modern-SaaS aesthetic. Clean, competent, completely anonymous.
- Spotify — the "we own your library" aesthetic. WatchAlong's whole thesis is that you own it, not us.

Here are reference points in the right direction — not to copy, but to understand the register:

- The indie game scene (Sokpop, Nathalie Lawhead) — opinionated, handmade, not afraid to look different.
- Print-era film criticism magazines (Sight & Sound, Cahiers du Cinéma) — confident typography, editorial weight, respect for the reader's intelligence.
- The FOSS community's best work (Signal, Bitwarden) — trustworthy-by-design, communicates its values through restraint.

## The vocabulary you have

You have one existing element worth carrying forward: the **green accent** (`#8ee2b1`) used for success states, auto-sync progress, and privacy badges. That green currently reads as "generic success green." It could read as something more specific — growth, the living room, the projection booth's exit sign, whatever the design language lands on. It's the one color in the current palette that has a hint of personality. Keep it, or evolve it, but don't lose it.

Everything else is open. Typography, color, texture, motion, the shape language — all yours. The current CSS is ~2,800 lines of competent-but-generic dark theme. You have full license to reshape it, or to keep the structure and change the surface, whichever serves the position.

## The surfaces

The QoL work gives you these surfaces to design through:
- **The library** — where the new identity gets to breathe. This is where a user spends time choosing. The three views (pairings / by reactor / by movie) are the canvas.
- **The entry flow** — download progress + autosync. This is the first impression. It should feel like one honest, continuous motion.
- **The player** — the control bar, the PiP, the timing panel. These work; they need the new skin, not a restructure.

## The constraint

The design must serve usability first. This is a tool people use to watch movies. The interface gets out of the way during playback. The library helps them find what they want quickly. The settings are clear. Nothing in the visual identity should make the app harder to use, slower to navigate, or more confusing than it already is. Beauty serves function here, not the other way around.

## The creative director's note

He said: "I don't know what that looks like, but if you can effectively communicate that to Sol, I bet he can figure it out." That's the trust. The position is clear. The visual language is the craft. Find it.

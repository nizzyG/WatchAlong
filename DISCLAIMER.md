# Disclaimer

WatchAlong is a local media sync tool. I built it for a community of people who already pay their favorite reactors on Patreon and already own the movies they watch — the tool just removes the technical friction of keeping everything in sync. The use case respects everyone involved: creators get paid, movies stay owned, and nobody's data gets harvested.

There are two ways to watch a movie today. You can rent access on a streaming service, where the movie stays until the license expires or the catalog rotates. Or you can own a copy — a DRM-free file on your drive that's yours. WatchAlong is built for people who chose ownership, and who also support the creators who make reaction content. The tool doesn't take a position on how you acquired your file. It takes a position on what it does with it: syncs it locally, with nothing leaving your machine unless you trigger it.

That said, here's what you need to know.

## Designed for lawful, user-authorized use. Your use is your responsibility.

WatchAlong doesn't provide, host, sell, or redistribute movie files or reaction files. It doesn't intentionally bypass DRM. The app syncs two local media files that you supply — that's it.

Some features can download reaction files from Patreon or YouTube using links and access credentials you provide. You are responsible for ensuring that your use complies with copyright law, creator permissions, and the terms of any platform you interact with. Having a Patreon subscription or owning a movie doesn't automatically mean you're authorized to download or retain a permanent local copy — that depends on the creator's permissions, the platform's terms, and your jurisdiction.

## Creators get paid. That's the point.

Full-length reactions live behind a Patreon paywall. WatchAlong doesn't bypass that — you need an active subscription to download. The only people who can use the Patreon download feature are people who are already supporting that creator. This tool exists to make the experience better for paying subscribers, not to take anything from the creators they support.

## No ads, no paid features, no data sale.

WatchAlong has no telemetry, no analytics, no crash reporter, no account system, no cloud library, and no server. Your library, playback state, settings, downloaded files, and optional saved Patreon session live on your own drive. The only network requests are ones you trigger: authenticating with Patreon or downloading a reaction. I don't collect your data, I don't sell your data, and there are no paid features, subscriptions, or ads.

WatchAlong is free and open source. I have no plans for paid features, ads, telemetry, or data monetization. Optional donations are accepted, but they don't unlock features or change how data is handled.

## Third-party tools, their own rules

WatchAlong bundles yt-dlp, FFmpeg, Node.js, and patreon-dl. These tools handle downloads and media processing locally on your machine. They're included for convenience so you don't have to install anything separately. Each is distributed under its own license — see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the full license texts and source information.

Using yt-dlp or patreon-dl may be subject to additional platform terms (YouTube, Patreon). You're responsible for reviewing and complying with those terms.

## No DRM circumvention

WatchAlong doesn't rip discs, remove DRM, or bypass copy protection. The bundled patreon-dl tool skips DRM-protected content. Downloads can also fail because of authentication, network, regional, platform, filesystem, or bundled-tool errors; a failure by itself does not show that content is DRM-protected.

## Your Patreon session

WatchAlong handles your Patreon session cookie with care: it's used locally to authenticate directly with Patreon, never sent to a WatchAlong server (there isn't one), temporarily written to OS temp files that are scrubbed and removed during cleanup (with crash leftovers retried at startup), and only saved to disk if you choose — encrypted with your operating system's secure storage. You can delete the saved session or revoke it from your Patreon account settings at any time. See [SECURITY.md](SECURITY.md) for the full details.

## No warranty

WatchAlong is provided "as is," without warranty of any kind. I've tested it thoroughly on the configurations I could get my hands on, but it might not work perfectly on yours. Use it at your own risk.

## Questions

If something in here concerns you, or you think something should be worded differently, [open an issue](https://github.com/nizzyG/WatchAlong/issues). I'd rather fix it than argue about it.

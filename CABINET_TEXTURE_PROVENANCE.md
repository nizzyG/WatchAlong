# Cabinet texture provenance

These cabinet textures are bundled renderer assets. WatchAlong never fetches them, or any other visual texture, at runtime.

Both source assets are from Poly Haven and released under the [Creative Commons CC0 1.0 Universal license](https://polyhaven.com/license). Attribution is not required by CC0, but it is recorded here to credit the artists and keep the asset history auditable.

## Mahogany cabinet

- **Poly Haven asset:** [Dark Wood](https://polyhaven.com/a/dark_wood)
- **Source file:** `dark_wood_diff_4k.jpg`
- **Source URL:** <https://dl.polyhaven.org/file/ph-assets/Textures/jpg/4k/dark_wood/dark_wood_diff_4k.jpg>
- **Contributors:** Dimitrios Savva (photography), Rico Cilliers (tiling), Dario Barresi (baking)
- **Source SHA-256:** `23b0d56932232c77b453f3db2b135f1a6375744be4b667c4b0f9f0ccb68a1481`
- **Bundled derivative:** `src/renderer/src/assets/wood/cabinet-mahogany-cc0.webp`
- **Derivative SHA-256:** `f4a033daf3cebe9fc5b1db0233442beef3c4dbef24328f3423e241be6c16f6cc`

## Oak cabinet

- **Poly Haven asset:** [Oak Veneer 01](https://polyhaven.com/a/oak_veneer_01)
- **Source file:** `oak_veneer_01_diff_4k.jpg`
- **Source URL:** <https://dl.polyhaven.org/file/ph-assets/Textures/jpg/4k/oak_veneer_01/oak_veneer_01_diff_4k.jpg>
- **Contributor:** Jenelle van Heerden
- **Source SHA-256:** `7e8c64811e580ef6664c20524606359c739e6fe030eff5c2c06c3482ecc8b1cf`
- **Bundled derivative:** `src/renderer/src/assets/wood/cabinet-oak-cc0.webp`
- **Derivative SHA-256:** `73d560b6dc9b7685d326dc82f9739f376984d8833b36a71f657200da3f44149e`

## WatchAlong transformations

The 4096 x 4096 diffuse maps were center-cropped to 16:9, downsampled to 2560 x 1440 with Lanczos resampling, stripped of source metadata, and encoded as lossy WebP. The source colors and grain direction are retained. A uniform alpha of 16% for Mahogany and 18% for Oak keeps the material perceptible without competing with posters, text, or state indicators.

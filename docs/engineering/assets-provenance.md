# Asset provenance and licensing

`@moonwitness/assets` is licensed under ISC. The logo, icon, social card, and README banner geometry are authored for MoonWitness in `packages/assets/scripts/generate.mjs`; the generated manifest refers to that source. They contain no third-party icon set or external SVG references.

The Board currently requests three font families from the Google Fonts stylesheet linked in `apps/board/index.html`: Anton, Space Grotesk, and JetBrains Mono. Their upstream metadata/license records are linked in [`packages/assets/licenses.json`](../../packages/assets/licenses.json). Upstream records identify each font under the SIL Open Font License 1.1: [Anton metadata](https://github.com/google/fonts/blob/main/ofl/anton/METADATA.pb), [Space Grotesk metadata](https://github.com/google/fonts/blob/main/ofl/spacegrotesk/METADATA.pb), and the [JetBrains Mono license](https://github.com/JetBrains/JetBrainsMono/blob/master/OFL.txt). Font binaries are not bundled in the asset package; the browser fetches them externally and falls back to system stacks when unavailable.

Before vendoring, modifying, or redistributing font binaries, re-check the exact upstream license and include its required notice with the distributed font files. The manifest's verification date records when the upstream entries were reviewed; it does not replace the license text.

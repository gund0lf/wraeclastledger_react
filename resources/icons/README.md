# WraeclastLedger semantic icon masters

User-provided artwork received September 7, 2026. Keep the PNGs here as originals.
`manifest.json` records dimensions, hashes and existing Discord export-marker names.
All 27 PNGs contain an alpha channel; 25 are 1254 x 1254, while wl_cost and wl_div
are 128 x 128. No image bytes were modified during intake.

The 22 existing Discord export marker names match the PNG basenames exactly.
The bot reads uploaded application emoji by those names; local files alone do not
register or replace Discord emojis. Keep canonical Unicode wire markers intact.
The remaining five assets are wl_home, wl_public, wl_following, wl_loot_league,
and wl_loot_other.

`wl_updated.png` was generated with the built-in image tool on September 7, 2026,
matching wl_time and wl_atlas. It represents Updated/history using a clock and
curved arrow. The final 1254 x 1254 PNG has verified alpha transparency, bringing
the collection to 28 icons. See `wl_updated.prompt.md` for generation provenance.

Use these as semantic UI/section/category artwork. Concrete PoE items retain their
exact source-verified item artwork; a generic chisel/scarab/gem illustration must
not replace an individual item's verified identity. League and Other represent
categories rather than a guessed item.

## Current placements

| Asset | Placement |
| --- | --- |
| wl_updated | Preserved master; website Updated uses an outline History icon |
| wl_public | Preferred website, Public strategy / league / revision line |
| wl_atlas | Preserved master; website Atlas uses a connected passive-node vector |
| wl_home | Website, Home community label |
| wl_loot_league | League loot category on the website and in desktop Dashboard/Strategy Browser |
| wl_loot_other | Other loot category on the website and in desktop Dashboard/Strategy Browser |

Originals remain here. Rebuild derivatives with `python scripts/prepare-semantic-icons.py`
from the project root (requires Pillow). Input SHA256 values are checked first.
The script only downsamples, preserving the complete canvas and alpha:

- Website: optional 96px PNGs under an explicitly supplied checkout's
  `public/icons/semantic`, using `--website PATH`. Only Public, Home, League and
  Other are generated; Updated and Atlas use code-native vectors. The default
  command does not write to another repository.
- Desktop: 96px PNGs in `src/renderer/src/assets/semantic` (only the two used categories).
- Discord: all 28 names at 128px in `resources/icons/discord`, ready for upload.

The masters, manifest and two desktop runtime PNGs are versioned. Reproducible
Discord upload copies are ignored. Keep temporary review captures untracked and
remove them after accepted assets are adopted. Preserve useful provenance in a
separate local archive; runtime assets must never depend on temporary review folders.

Unused semantic masters remain available for later placements. Discord upload and
runtime release/deployment are separate; no emoji or wire marker was changed.
UI images retain neutral vector fallbacks on failure, with existing text labels.

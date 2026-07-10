# WP1 real-world fixtures (provided by Sad, 2026-07-02)

ASCII README. The .txt fixtures are verbatim user-provided data (map files are
raw in-game Ctrl+C clipboards; export files are real app output from v1.0.62
and contain emoji BY DESIGN - they are wire format, never edit them).

## Map clipboards (canonical home: wp1Fixtures.ts MAP_CLIPBOARDS)

DEDUP 2026-07-02: the seven map_*.txt files duplicated wp1Fixtures.ts verbatim
and were removed (parked in _trash/fixtures-dedup-2026-07-02, safe to delete).
mapParser.fixtures.test.ts imports MAP_CLIPBOARDS from wp1Fixtures.ts.
Reference list of what each clipboard covers (keys in wp1Fixtures.ts):

- map_regular_alched_t16              52Q/31R/20P, 4 mods, no flags
- map_regular_chiseled_t16            55Q/32R/21P + div-card quality lines, 4 mods
- map_regular_deli20_t16              65Q/40R/25P, deli enchant section (1 reward + 20% Delirious), 6 mods
- map_blighted_t14                    Blighted Map (Tier 14), Map Area line, 4 implicits, 4 mods
                                      (Sad: "imagine this being a t16" - tier value itself is real t14)
- map_8mod_corrupted_t16              101Q/61R/39P, isCorrupted, 11 mod lines (8-mod affix map)
- map_nightmare                       "Nightmare Map" (NO tier line!), 75Q/85R/29P,
                                      More Maps +35 / More Scarabs +60, "Modifiable only with..." trailer,
                                      isNightmare, NOT corrupted
- map_originator_80deli_split_t16     90Q/160R/59P, More Currency +144 + Quality (Currency) +20,
                                      4x deli reward enchants + 80% Delirious, Originator implicit,
                                      trailing "Split" section, isOriginator

## WealthyExile CSVs (wexile_base.csv / wexile_return.csv - lootUtils.fixtures.test.ts)

Real exports (611 / 606 data rows, UTF-8 BOM at start, no trailing newline -
parser must tolerate both). Constructed scenario: baseline taken with 9x lvl-1
Enhance +
investment items in tab; return taken after swapping to 9x lvl-4 Enhance,
returning withdrawn currency, and removing investment items.
Key diff expectations:
- DISAPPEARED (all six match the investment setup; detection total 6448.05c,
  banner offered +6448.1c): Breach Scarab of Instability 1547.36c, Scarab of
  Wisps 1545.19c, Horned Scarab of Bloodlines 1103c, Grasping Astrolabe
  926.8c, Cartography Scarab of Risk 671.7c, Fine Delirium Orb 654c.
- Chaos Orb 1300 -> 476; Divine Orb 20 (11498c) -> 182 (104631.8c);
  Valdo's Puzzle Box NEW 29 (12675.9c).
- Gems: "Enhance Support - 1/0" 9x (45c) disappeared; "Enhance Support - 4/0
  corrupted" 9x (3600c) appeared - exercises advGemName auto-exclusion
  (name "Enhance", partial match) + the 45c gemBuyOffset.
- Diacritic names present (Black Morrigan with o-acute, Maelstrom of Chaos
  with o-umlaut) - exercise normalization.

## Discord exports (for parseDiscordExport round-trip + WP1 parity)

Both from the SAME constructed 38-map session (divine 500c, base map 1500c,
Avarice chisel 150c, 4x Fine deli orb 100c each PER MAP, Grasping Astrolabe
7x10c, gems 9x Enhance buy 5c sell 385c, baseline present, loot gain incl.
45c gem offset = 98537.6c).

Advanced Costs decomposition (CONFIRMED by Sad 2026-07-02):
chaos 750 + exalt 700 (500 qty) + scour 100 (500 qty) + alch 100 (500 qty)
= 1650c, + astrolabe 7x10 = 70c, + deli 4/map x 100c.
Stored stale rolling total at export time: 2120c = 1650 + 70 + 400 x 1
(deli frozen at mapCount 1 - live demonstration of the stale-rolling bug).
TRUE live rolling at 38 maps: 1650 + 70 + 15200 = 16920c.

- export_no_preservation_38maps.txt   scarabs 5+100+5+70+20 = 200c/map.
- export_preservation_38maps_BUGGY.txt  Breach 5c swapped for Horned Scarab
  of Preservation 7c; the file's money lines show ShareModal bug #1
  (all scarabs counted per-map): perMap 1852c / invest 72496c / net +26041.6c.
  Do not assert those lines as truth - only that the parser reads them.

## LOCKED expected values for the WP1 parity tests (divine 500c, 38 maps)

CORRECTED (what computeProfit + the new export builder MUST produce, with
live rolling 16920c):
- Preservation:    perMap 1657.0c | invest 80081.0c (= 1657x38 + 16920 + 195
                   one-time scarabs) | net +18456.6c | +485.7c/map | 0.971 d/map
- No preservation: perMap 1850.0c | invest 87220.0c (= 1850x38 + 16920)
                   | net +11317.6c | +297.8c/map | 0.596 d/map

NOTE 2026-07-02 (one-definition decision): the EXPORT "Per Map Cost" line,
the Investment badge, and the Strategy Browser display now all print the
ALL-IN figure (totalInvest / maps): 2107.4c preservation, 2295.3c
no-preservation. perMapBase (1657 / 1850) remains an internal computeCosts
value and a component of Total Invest — it is no longer a user-facing
headline anywhere.

LEGACY reference (internally consistent with the FROZEN 2120c rolling value;
matches the v1.0.62 screenshots - kept to document the staleness bug, never
asserted as correct):
- Preservation Dashboard: invest 65281c | net +33257c | +875c/map | 1.750 d/map
- No preservation:        invest 72420c | net +26117.6c | +687.3c/map | 1.375 d/map

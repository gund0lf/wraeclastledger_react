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

## Delirium map metadata (deliriumMapFixtures.ts, provided by Sad, 2026-08-21)

Five real Allflame T16 texts cover 20/40/60/80/100% Delirious maps. The first
is an ordinary advanced clipboard and the remaining four came from Trade, with
their price-note trailers retained. Expected reward tracks are stored in exact
clipboard order, including the repeated Jewellery and Armour tracks at 100%.

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

## WP14 Phase 0 storage fixtures

These fixtures characterize the pre-WP14 Zustand persistence boundary. Except
for `duplicate-import.json`, every lifecycle fixture uses the wire format the app
actually boots from:

```json
{ "state": { "...top-level store data..." : "..." }, "version": 17 }
```

The session-manager export format (`{ version, exportedAt, sessions }`) is NOT a
bootstrap fixture. It appears only in the duplicate/import class because that is
the real input consumed by `importSessions`.

The verified July 6 source export contains 3 sessions / 140 maps / 606 return +
611 baseline items per session and zero `rawText`. That is correct current
behavior, not data loss: current auto-save deliberately strips `rawText` from
saved-session catalogue entries. WP14 instead preserves source text in active
working payloads and retained versions. Therefore the active and rawText-heavy
fixtures clone the verbatim in-game map texts in `wp1Fixtures.ts`; the saved
session fixtures must remain rawText-free.

Generation is deterministic. The default seed is decimal `336011302`
(`0x14072026`); the same source export and seed produce byte-identical output.
The large fixtures are generated locally under ignored `wp14-profile/` and are
never committed. In PowerShell:

```powershell
npm.cmd run wp14:fixtures -- --profile-export "<path-to-wraeclast-sessions.json>"
```

The command refuses an unexpected source hash, writes the fixtures, and records
the full inventory in ignored `wp14-profile/fixture-metadata.json`.

### Tracked small fixtures

| File | Class | Raw bytes | Gzip bytes | SHA-256 |
|---|---:|---:|---:|---|
| `wp14/legacy-v13-envelope.json` | legacy v13 | 5,999 | 1,055 | `a87259feff9a1edf0fed54a992e298fd330f4d67133237e09cfad773ed089821` |
| `wp14/legacy-v17-envelope.json` | legacy v17 | 7,731 | 1,726 | `6d59653d199e061bd8c931037d8d23de2964c3655c43e8fe03204a10275a7278` |
| `wp14/active-named-dirty-envelope.json` | active named dirty | 8,801 | 2,082 | `2872c5ca5d1c54fab9c07a188238f6694b1217859e803718ec071b18d53ff78d` |
| `wp14/unnamed-working-envelope.json` | unnamed working | 4,185 | 1,726 | `2f9354f2bb403e65c6576723d69d19948eb081dc7f97f341d15f112bc19df730` |
| `wp14/corrupt-empty.json` | corrupt: 0-byte | 0 | 20 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `wp14/corrupt-malformed.json` | corrupt: malformed | 19 | 39 | `50727e4346476f428f6f0ba614c5901a75f2fb24d8ff72f7c885937d35ac386f` |
| `wp14/corrupt-truncated.json` | corrupt: truncated | 3,871 | 1,289 | `fc4d5b58317980ba6e5228ad2211d803d38ce9885626f43d749253f743307e4b` |
| `wp14/corrupt-inconsistent-envelope.json` | corrupt: inconsistent types | 2,153 | 955 | `5bf45609db8c9fb2e1e20e402b1a3123ff6ed68256b2a219b5b199dce981574b` |
| `wp14/corrupt-newer-version-envelope.json` | corrupt/recovery: version 18 | 2,999 | 1,214 | `b110eb5f7c717cbf86ed7c0183d054d80a1019ffbbbf6b1fad0ea65a5e02af9c` |
| `wp14/duplicate-import.json` | duplicate/import | 3,915 | 852 | `c815c8ce4debf2c5465cbed592f29b197850b4bd901f55d65bc29b05a74cf3ce` |

`duplicate-import.json` deliberately includes the same first session ID as the
active-named-dirty fixture, plus one new session, so skip/overwrite behavior can
be exercised against a genuine import envelope.

### Ignored profile-derived and generated fixtures

The original source is never copied into git. Its independently verified
SHA-256 is
`04fefa316ebf7892e3a589796cb7fcf978eec6a604cb58e04182dfc5126c6744`
(987,473 bytes). The anonymizer scrubs the notes string and any Discord
identifiers while leaving session names, loot/baseline item names, and map data
unchanged.

| File | Class | Raw bytes | Gzip bytes | SHA-256 |
|---|---:|---:|---:|---|
| `wp14-profile/anonymized-session-export.json` | real import source | 987,474 | 160,884 | `e0f23283fb9d7cb4b5bfd6abbd3a62c16bca6a2441e6bef5cd35b42ae19f19de` |
| `wp14-profile/large-session-envelope.json` | one large loaded session | 1,162,341 | 292,261 | `bb375a4deb1bf13372cf6cddae9c11e1c3aa9f75a58211c1d1956c3e5bcebed3` |
| `wp14-profile/rawtext-heavy-10mib-envelope.json` | active rawText-heavy 10 MiB class | 10,486,709 | 147,993 | `4b4666a899150356ac1c6715e0eabdfd9f1911e0b457bf8f48568c8485574571` |
| `wp14-profile/many-session-envelope.json` | deterministic 100-session catalogue | 9,778,864 | 2,484,004 | `606901a60cdc8ca82ff196eed32610ad3840ec2d311ee3313524f5a81dff8c5b` |

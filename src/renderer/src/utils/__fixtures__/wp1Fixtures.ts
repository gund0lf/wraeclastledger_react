/**
 * WP1 fixtures — real data provided by Sad (July 2026), see IMPROVEMENT_PLAN.md #1.
 *
 * MAP_CLIPBOARDS: verbatim Ctrl+C tooltips from the Ancestors event (3.28 base).
 * DISCORD_EXPORTS: two real exports from the hand-verified 38-map test scenario
 * (same session; only scarab slot 1 differs: 5c Breach Scarab vs 7c Preservation).
 * These were produced by the PRE-WP1 ShareModal and therefore contain the WRONG
 * numbers for the preservation variant — kept verbatim as historical evidence and
 * as parser input for the future discordExport round-trip tests. The CORRECT
 * numbers live in profit.test.ts (verified by hand by Sad and mechanically
 * against Dashboard semantics).
 */

export const MAP_CLIPBOARDS = {
  /** Regular alched T16, 4 mods, no quality. */
  regularAlched: `Item Class: Maps
Rarity: Rare
Bleak Inscription
Map (Tier 16)
--------
Item Quantity: +52% (augmented)
Item Rarity: +31% (augmented)
Monster Pack Size: +20% (augmented)
--------
Item Level: 83
--------
Monster Level: 83
--------
42% more Monster Life
Monsters take 38% reduced Extra Damage from Critical Strikes
Unique Bosses are Possessed
Area is inhabited by Ghosts
--------
Travel to a Map of this tier or lower by using this in a personal Map Device. Maps can only be used once. `,

  /** Regular alched T16 + Divination chisel (20% quality, "More Divination Cards" stat). */
  regularChiseled: `Item Class: Maps
Rarity: Rare
Desolate Compass
Map (Tier 16)
--------
Item Quantity: +55% (augmented)
Item Rarity: +32% (augmented)
Monster Pack Size: +21% (augmented)
More Divination Cards: +50% (augmented)
Quality (Divination Cards): +20% (augmented)
--------
Item Level: 83
--------
Monster Level: 83
--------
Area has patches of Burning Ground
Area contains many Totems
22% increased Monster Damage
Area is inhabited by Abominations
--------
Travel to a Map of this tier or lower by using this in a personal Map Device. Maps can only be used once. `,

  /** Regular alched T16 + 1 delirium orb (enchant section before mods). */
  regularDeli: `Item Class: Maps
Rarity: Rare
Whispering Toil
Map (Tier 16)
--------
Item Quantity: +65% (augmented)
Item Rarity: +40% (augmented)
Monster Pack Size: +25% (augmented)
--------
Item Level: 83
--------
Monster Level: 83
--------
Delirium Reward Type: Map Items (enchant)
Players in Area are 20% Delirious (enchant)
--------
Players are Cursed with Enfeeble
Players are Cursed with Elemental Weakness
Monsters gain an Endurance Charge on Hit
+25% Monster Chaos Resistance
+40% Monster Elemental Resistances
Area is inhabited by Solaris fanatics
--------
Travel to a Map of this tier or lower by using this in a personal Map Device. Maps can only be used once. `,

  /** Blighted map (T14 in fixture; implicit block must not count as mods). */
  blighted: `Item Class: Maps
Rarity: Rare
Anguish Artifice
Blighted Map (Tier 14)
--------
Map Area: Coral Ruins
Item Quantity: +52% (augmented)
Item Rarity: +31% (augmented)
Monster Pack Size: +20% (augmented)
More Divination Cards: +50% (augmented)
Quality (Divination Cards): +20% (augmented)
--------
Item Level: 83
--------
Monster Level: 81
--------
Area is infested with Fungal Growths (implicit)
Map's Item Quantity Modifiers also affect Blight Chest count at 25% value (implicit)
Can be Anointed up to 3 times (implicit)
Natural inhabitants of this area have been removed (implicit)
--------
20% increased Magic Monsters
45% more Monster Life
Monsters cannot be Leeched from
Area is inhabited by Lunaris fanatics
--------
Travel to a Map of this tier or lower by using this in a personal Map Device. Maps can only be used once. `,

  /** 8-mod corrupted regular T16 (trailing Corrupted section; 11 mod LINES). */
  eightModCorrupted: `Item Class: Maps
Rarity: Rare
Rune Crosscut
Map (Tier 16)
--------
Item Quantity: +101% (augmented)
Item Rarity: +61% (augmented)
Monster Pack Size: +39% (augmented)
--------
Item Level: 84
--------
Monster Level: 83
--------
Area has increased monster variety
Players are Cursed with Vulnerability
Monsters gain an Endurance Charge on Hit
Monsters' skills Chain 2 additional times
Unique Boss has 35% increased Life
Unique Boss has 70% increased Area of Effect
Monsters take 39% reduced Extra Damage from Critical Strikes
+25% Monster Chaos Resistance
+40% Monster Elemental Resistances
Players have 30% less Armour
Players have 40% reduced Chance to Block
--------
Travel to a Map of this tier or lower by using this in a personal Map Device. Maps can only be used once. 
--------
Corrupted`,

  /** Uncorrupted Nightmare map (no tier line; restriction footer is NOT corruption). */
  nightmare: `Item Class: Maps
Rarity: Rare
Fate Incitement
Nightmare Map
--------
Item Quantity: +75% (augmented)
Item Rarity: +85% (augmented)
Monster Pack Size: +29% (augmented)
More Maps: +35% (augmented)
More Scarabs: +60% (augmented)
--------
Item Level: 84
--------
Monster Level: 83
--------
Area has patches of desecrated ground
28% more Monster Life
Monsters cannot be Stunned
Monsters Poison on Hit
Monsters have +1 to Maximum Power Charges
Monsters gain a Power Charge on Hit
All Monster Damage can Ignite, Freeze and Shock
All Damage from Monsters' Hits can Poison
Monsters have a 50% chance to avoid Poison, Impale, and Bleeding
Monsters have 100% increased Poison Duration
Monsters Ignite, Freeze and Shock on Hit
--------
Travel to a Map of this tier or lower by using this in a personal Map Device. Maps can only be used once. 
--------
Modifiable only with Chaos Orbs, Vaal Orbs, Delirium Orbs and Chisels`,

  /** Originator T16, 80% deli (4 orbs), Currency chisel, trailing Split section. */
  originatorDeli: `Item Class: Maps
Rarity: Rare
Ominous Intent
Map (Tier 16)
--------
Item Quantity: +90% (augmented)
Item Rarity: +160% (augmented)
Monster Pack Size: +59% (augmented)
More Currency: +144% (augmented)
Quality (Currency): +20% (augmented)
--------
Item Level: 84
--------
Monster Level: 83
--------
Delirium Reward Type: Currency (enchant)
Delirium Reward Type: Currency (enchant)
Delirium Reward Type: Currency (enchant)
Delirium Reward Type: Currency (enchant)
Players in Area are 80% Delirious (enchant)
--------
Area is Influenced by the Originator's Memories (implicit)
--------
25% increased Monster Movement Speed
43% increased Monster Attack Speed
44% increased Monster Cast Speed
Monsters have +50% Chance to Block Attack Damage
Area contains Unstable Tentacle Fiends
Players have 29% less Area of Effect
Rare monsters in area Temporarily Revive on death
Players are assaulted by Bloodstained Sawblades
--------
Travel to a Map of this tier or lower by using this in a personal Map Device. Maps can only be used once. 
--------
Split`,
  /** Originator split T16, PACK SIZE chisel — verifies "Quality (Pack Size)" string. Also: More Maps on a regular (non-Nightmare) map. */
  chiseledPackSize: `Item Class: Maps
Rarity: Rare
Mythic Journey
Map (Tier 16)
--------
Item Quantity: +87% (augmented)
Item Rarity: +159% (augmented)
Monster Pack Size: +57% (augmented)
More Maps: +35% (augmented)
More Currency: +45% (augmented)
Quality (Pack Size): +20% (augmented)
--------
Item Level: 85
--------
Monster Level: 83
--------
Area is Influenced by the Originator's Memories (implicit)
--------
Monsters have +1 to Maximum Power Charges
Monsters gain a Power Charge on Hit
Monsters' skills Chain 3 additional times
Monsters' Projectiles can Chain when colliding with Terrain
Monsters have 50% increased Accuracy Rating
Monsters gain 186% of their Physical Damage as Extra Damage of a random Element
Players are targeted by a Meteor when they use a Flask
Players have -20% to amount of Suppressed Spell Damage Prevented
Area contains Drowning Orbs
--------
Travel to a Map of this tier or lower by using this in a personal Map Device. Maps can only be used once. 
--------
Split`,

  /** Originator split T16, SCARABS chisel — verifies "Quality (Scarabs)" string. */
  chiseledScarabs: `Item Class: Maps
Rarity: Rare
Doom Course
Map (Tier 16)
--------
Item Quantity: +96% (augmented)
Item Rarity: +53% (augmented)
Monster Pack Size: +46% (augmented)
More Scarabs: +50% (augmented)
More Currency: +47% (augmented)
Quality (Scarabs): +20% (augmented)
--------
Item Level: 84
--------
Monster Level: 83
--------
Area is Influenced by the Originator's Memories (implicit)
--------
44% increased number of Rare Monsters
Players have -10% to all maximum Resistances
Monsters have 400% increased Critical Strike Chance
+45% to Monster Critical Strike Multiplier
Monsters deal 90% extra Physical Damage as Lightning
Players have 40% less effect of Flasks applied to them
Rare Monsters each have 1 additional Modifier
Rare monsters in area Temporarily Revive on death
--------
Travel to a Map of this tier or lower by using this in a personal Map Device. Maps can only be used once. 
--------
Split`,

  /** Originator split T16, DIVINATION chisel (second sample) — verifies "Quality (Divination Cards)" + moreDivCards on a stat-dense map. */
  chiseledDivination2: `Item Class: Maps
Rarity: Rare
Dread Direction
Map (Tier 16)
--------
Item Quantity: +87% (augmented)
Item Rarity: +51% (augmented)
Monster Pack Size: +45% (augmented)
More Currency: +47% (augmented)
More Divination Cards: +50% (augmented)
Quality (Divination Cards): +20% (augmented)
--------
Item Level: 84
--------
Monster Level: 83
--------
Area is Influenced by the Originator's Memories (implicit)
--------
Players are Cursed with Temporal Chains
125% more Monster Life
Monsters cannot be Stunned
60% less effect of Curses on Monsters
Area contains Unstable Tentacle Fiends
25% chance for Rare Monsters to Fracture on death
--------
Travel to a Map of this tier or lower by using this in a personal Map Device. Maps can only be used once. 
--------
Split`,

  /** Originator split T16, RARITY (Procurement) chisel — verifies "Quality (Rarity)" string. */
  chiseledRarity: `Item Class: Maps
Rarity: Rare
Foul Compass
Map (Tier 16)
--------
Item Quantity: +84% (augmented)
Item Rarity: +89% (augmented)
Monster Pack Size: +43% (augmented)
More Currency: +94% (augmented)
Quality (Rarity): +20% (augmented)
--------
Item Level: 84
--------
Monster Level: 83
--------
Area is Influenced by the Originator's Memories (implicit)
--------
Players are Cursed with Elemental Weakness
95% more Monster Life
Monsters have 374% increased Critical Strike Chance
+41% to Monster Critical Strike Multiplier
Unique Boss has 35% increased Life
Unique Boss has 70% increased Area of Effect
Rare monsters in area Temporarily Revive on death
Players are assaulted by Bloodstained Sawblades
--------
Travel to a Map of this tier or lower by using this in a personal Map Device. Maps can only be used once. 
--------
Split`,

  /** Originator split T16, CURRENCY (Avarice) chisel — second verification of "Quality (Currency)". */
  chiseledCurrency: `Item Class: Maps
Rarity: Rare
Vengeance Frontier
Map (Tier 16)
--------
Item Quantity: +81% (augmented)
Item Rarity: +49% (augmented)
Monster Pack Size: +46% (augmented)
More Currency: +95% (augmented)
Quality (Currency): +20% (augmented)
--------
Item Level: 84
--------
Monster Level: 83
--------
Area is Influenced by the Originator's Memories (implicit)
--------
Monsters have 70% chance to Avoid Elemental Ailments
22% increased Monster Damage
Area contains Runes of the Searing Exarch
Monsters have 50% increased Accuracy Rating
Monsters gain 41% of Maximum Life as Extra Maximum Energy Shield
Players are targeted by a Meteor when they use a Flask
Players have -20% to amount of Suppressed Spell Damage Prevented
--------
Travel to a Map of this tier or lower by using this in a personal Map Device. Maps can only be used once. 
--------
Split`,
} as const;

/**
 * Real exports from the PRE-WP1 ShareModal (v1.0.62). The preservation variant's
 * Per Map Cost / Total Invest / Net Profit / Div-Map are WRONG (missing the
 * preservation split) — see profit.test.ts for the correct values.
 */
export const DISCORD_EXPORTS = {
  preservationWRONG: `[WraeclastLedger Session]
**Map Session — WraeclastLedger**
📦 **Maps:** 38 | **Type:** 6-mod | **Multiplier:** 1.63×
🪨 **Chisel:** Avarice (150c)
📊 **Avg Quant:** 83% | **Avg Rarity:** 63% | **Avg Pack:** 45% | **Avg Currency:** 117%
💰 **Per Map Cost:** 1852.0c | **Total Invest:** 72496.0c
🎯 **Total Return:** 98537.6c | **Net Profit:** +26041.6c
📈 **Div / Map:** 1.371d | **Divine Price:** 500c
🦂 **Scarabs:**
  - Horned Scarab of Preservation (7c)
  - Horned Scarab of Bloodlines (100c)
  - Breach Scarab of Instability (5c)
  - Cartography Scarab of Risk (70c)
  - Scarab of Wisps (20c)
🌫️ **Delirium Orbs:** 4x Fine (80% delirious, 100.0c each = 400.0c/map)
🌍 **Astrolabe:** Grasping Astrolabe (7x, 10c each)
🌳 **Atlas Tree:** https://pathofpathing.com/?v=3.28.0-atlas-league#AAAABgAADAsAJMFG206LU2FYqXF1sibDTcnCzw7qynF1AAA=
🏆 **League:** Ancestors
🏷️ **Tags:** originator, breach, cartography, astrolabe-grasping
⛔ **Excluded drops (1):** Enhance Support - 4/0 corrupted (3600c)
💫 **Gem leveling:** 9 gems | buy 45c | sell 3465c | net +3420c *(excluded from map profit)*

🔍 **Generated Regex (38 maps, trimmed avg)**
Avg: 83%Q · 63%R · 45%P · 117% Curr
*Brick exclusion is build-dependent — edit in settings*
🟢 Run: \`"urr.*(1[1-9].|[2-9]..)%" "ack.*([4-9].|\\d..)%" "iz.*([4-9].|\\d..)%" "m rar.*([3-9].|\\d..)%"\`
🟠 Slam: \`"(urr.*([8-9].|\\d..)%|ack.*([3-9].|\\d..)%)"\` *(open slots only)*`,

  nonPreservation: `[WraeclastLedger Session]
**Map Session — WraeclastLedger**
📦 **Maps:** 38 | **Type:** 6-mod | **Multiplier:** 1.63×
🪨 **Chisel:** Avarice (150c)
📊 **Avg Quant:** 83% | **Avg Rarity:** 63% | **Avg Pack:** 45% | **Avg Currency:** 117%
💰 **Per Map Cost:** 1850.0c | **Total Invest:** 72420.0c
🎯 **Total Return:** 98537.6c | **Net Profit:** +26117.6c
📈 **Div / Map:** 1.375d | **Divine Price:** 500c
🦂 **Scarabs:**
  - Breach Scarab of Instability (5c)
  - Horned Scarab of Bloodlines (100c)
  - Breach Scarab of Instability (5c)
  - Cartography Scarab of Risk (70c)
  - Scarab of Wisps (20c)
🌫️ **Delirium Orbs:** 4x Fine (80% delirious, 100.0c each = 400.0c/map)
🌍 **Astrolabe:** Grasping Astrolabe (7x, 10c each)
🌳 **Atlas Tree:** https://pathofpathing.com/?v=3.28.0-atlas-league#AAAABgAADAsAJMFG206LU2FYqXF1sibDTcnCzw7qynF1AAA=
🏆 **League:** Ancestors
🏷️ **Tags:** originator, breach, cartography, astrolabe-grasping
⛔ **Excluded drops (1):** Enhance Support - 4/0 corrupted (3600c)
💫 **Gem leveling:** 9 gems | buy 45c | sell 3465c | net +3420c *(excluded from map profit)*

🔍 **Generated Regex (38 maps, trimmed avg)**
Avg: 83%Q · 63%R · 45%P · 117% Curr
*Brick exclusion is build-dependent — edit in settings*
🟢 Run: \`"urr.*(1[1-9].|[2-9]..)%" "ack.*([4-9].|\\d..)%" "iz.*([4-9].|\\d..)%" "m rar.*([3-9].|\\d..)%"\`
🟠 Slam: \`"(urr.*([8-9].|\\d..)%|ack.*([3-9].|\\d..)%)"\` *(open slots only)*`,
} as const;

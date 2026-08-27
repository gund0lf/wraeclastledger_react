/** Real Allflame 3.29 map texts supplied by Sad on 2026-08-21. */
export const DELIRIUM_MAP_FIXTURES = [
  {
    name: 'Eerie Invocation',
    deliriousPct: 20,
    rewardTypes: ['Weapons'],
    text: `Item Class: Maps
Rarity: Rare
Eerie Invocation
Map (Tier 16)
Item Quantity: +104% (augmented)
Item Rarity: +61% (augmented)
Monster Pack Size: +40% (augmented)
Item Level: 84
Monster Level: 83
Delirium Reward Type: Weapons (enchant)
Players in Area are 20% Delirious (enchant)
{ Prefix Modifier "Fleet" (Tier: 1) — Attack, Caster, Speed }
28(25-30)% increased Monster Movement Speed
42(35-45)% increased Monster Attack Speed
42(35-45)% increased Monster Cast Speed
{ Prefix Modifier "Feasting" (Tier: 1) }
Area is inhabited by Cultists of Kitava — Unscalable Value
{ Prefix Modifier "Fecund" (Tier: 1) — Life }
46(40-49)% more Monster Life
{ Prefix Modifier "Burning" (Tier: 1) — Damage, Physical, Elemental, Fire }
Monsters deal 99(90-110)% extra Physical Damage as Fire
{ Suffix Modifier "of Bloodlines" (Tier: 1) }
29(20-30)% increased Magic Monsters
{ Suffix Modifier "of Enervation" (Tier: 1) }
Monsters steal Power, Frenzy and Endurance charges on Hit
{ Suffix Modifier "of Carnage" (Tier: 1) }
Monsters Maim on Hit with Attacks
(Maimed enemies have 30% reduced Movement Speed)
{ Suffix Modifier "of Toughness" (Tier: 1) — Damage, Critical }
Monsters take 36(36-40)% reduced Extra Damage from Critical Strikes
Travel to a Map of this tier or lower by using this in a personal Map Device. Maps can only be used once.
Corrupted`,
  },
  {
    name: 'Foe Voyage',
    deliriousPct: 40,
    rewardTypes: ['Unique Items', 'Weapons'],
    text: `Item Class: Maps
Rarity: Rare
Foe Voyage
Map (Tier 16)
Item Quantity: +107% (augmented)
Item Rarity: +64% (augmented)
Monster Pack Size: +41% (augmented)
Item Level: 85
Monster Level: 83
Delirium Reward Type: Unique Items (enchant)
Delirium Reward Type: Weapons (enchant)
Players in Area are 40% Delirious (enchant)
Area has increased monster variety
21% increased Magic Monsters
Players have -11% to all maximum Resistances
+40% Monster Physical Damage Reduction
Area contains two Unique Bosses
All Monster Damage from Hits always Ignites
Players have 60% reduced effect of Non-Curse Auras from Skills
Players have 25% less Area of Effect
Travel to a Map of this tier or lower by using this in a personal Map Device. Maps can only be used once.
Corrupted
Note: ~b/o 5 chaos`,
  },
  {
    name: 'Torture Route',
    deliriousPct: 60,
    rewardTypes: ['Currency', 'Armour', 'Jewellery'],
    text: `Item Class: Maps
Rarity: Rare
Torture Route
Map (Tier 16)
Item Quantity: +107% (augmented)
Item Rarity: +65% (augmented)
Monster Pack Size: +41% (augmented)
Item Level: 84
Monster Level: 83
Delirium Reward Type: Currency (enchant)
Delirium Reward Type: Armour (enchant)
Delirium Reward Type: Jewellery (enchant)
Players in Area are 60% Delirious (enchant)
25% more Monster Life
Monsters cannot be Stunned
Monsters gain an Endurance Charge on Hit
Monsters have 50% increased Accuracy Rating
+25% Monster Chaos Resistance
+40% Monster Elemental Resistances
60% less effect of Curses on Monsters
Monsters have a 20% chance to Ignite, Freeze and Shock on Hit
Players have 40% less Cooldown Recovery Rate
Players have 60% less Recovery Rate of Life and Energy Shield
Players have -20% to amount of Suppressed Spell Damage Prevented
Travel to a Map of this tier or lower by using this in a personal Map Device. Maps can only be used once.
Corrupted
Note: ~b/o 6 chaos`,
  },
  {
    name: 'Nightmare Realm',
    deliriousPct: 80,
    rewardTypes: ['Jewellery', 'Blight Items', 'Unique Items', 'Armour'],
    text: `Item Class: Maps
Rarity: Rare
Nightmare Realm
Map (Tier 16)
Item Quantity: +95% (augmented)
Item Rarity: +56% (augmented)
Monster Pack Size: +37% (augmented)
Item Level: 85
Monster Level: 83
Delirium Reward Type: Jewellery (enchant)
Delirium Reward Type: Blight Items (enchant)
Delirium Reward Type: Unique Items (enchant)
Delirium Reward Type: Armour (enchant)
Players in Area are 80% Delirious (enchant)
Area has increased monster variety
27% increased Magic Monsters
Players cannot inflict Exposure
Rare Monsters have [PhysicalThorns|Physical Thorns] reflecting 800 Physical Damage
Monsters deal 97% extra Physical Damage as Fire
Monsters take 37% reduced Extra Damage from Critical Strikes
Monsters have a 20% chance to Ignite, Freeze and Shock on Hit
Players have 60% less Recovery Rate of Life and Energy Shield
Travel to a Map of this tier or lower by using this in a personal Map Device. Maps can only be used once.
Corrupted
Note: ~b/o 6 chaos`,
  },
  {
    name: 'Lost Challenge',
    deliriousPct: 100,
    rewardTypes: ['Jewellery', 'Jewellery', 'Armour', 'Armour', 'Currency'],
    text: `Item Class: Maps
Rarity: Rare
Lost Challenge
Map (Tier 16)
Item Quantity: +107% (augmented)
Item Rarity: +64% (augmented)
Monster Pack Size: +41% (augmented)
Item Level: 84
Monster Level: 83
Delirium Reward Type: Jewellery (enchant)
Delirium Reward Type: Jewellery (enchant)
Delirium Reward Type: Armour (enchant)
Delirium Reward Type: Armour (enchant)
Delirium Reward Type: Currency (enchant)
Players in Area are 100% Delirious (enchant)
Area has patches of Chilled Ground
Players are Cursed with Temporal Chains
Players are Cursed with Elemental Weakness
Unique Boss deals 25% increased Damage
Unique Boss has 30% increased Attack and Cast Speed
+25% Monster Chaos Resistance
+40% Monster Elemental Resistances
60% less effect of Curses on Monsters
Monsters have +60% chance to Suppress Spell Damage
Players cannot Regenerate Life, Mana or Energy Shield
Travel to a Map of this tier or lower by using this in a personal Map Device. Maps can only be used once.
Corrupted
Note: ~b/o 10 chaos`,
  },
] as const;

/**
 * Real Allflame 3.29 Nightmare map supplied by Sad on 2026-08-27.
 * It is not Delirious, but its fixed crafting footer names Delirium Orbs and a
 * separate modifier contains 20%. A broad `deli` stash term therefore produces
 * false None and 20% matches when the item text is searched as one record.
 */
export const NIGHTMARE_DELIRIUM_FOOTER_FIXTURE = `Item Class: Maps
Rarity: Rare
Havoc Trek
Nightmare Map
--------
Item Quantity: +116% (augmented)
Item Rarity: +177% (augmented)
Monster Pack Size: +44% (augmented)
More Scarabs: +35% (augmented)
More Currency: +64% (augmented)
--------
Item Level: 83
--------
Monster Level: 83
--------
{ Prefix Modifier "Overlord's" — Attack, Caster, Speed }
Unique Boss deals 25% increased Damage
Unique Boss has 30% increased Attack and Cast Speed
{ Prefix Modifier "Magnifying" (Tier: 1) }
Monsters have 100% increased Area of Effect
Monsters fire 2 additional Projectiles
{ Prefix Modifier "Impaling" }
Monsters' Attacks have 60% chance to Impale on Hit
(When an Impaled enemy is hit, the Impale reflects 10% of the physical damage of the Impaling hit to that enemy. Impale lasts for 5 hits or 8 seconds)
{ Prefix Modifier "Empowered" — Elemental, Fire, Cold, Lightning, Ailment }
Monsters have a 20% chance to Ignite, Freeze and Shock on Hit
{ Suffix Modifier "of Impotence" (Tier: 1) }
Players have 30(30-25)% less Area of Effect
{ Suffix Modifier "of Miring" (Tier: 1) }
Players have 27(30-25)% less Defences
(Armour, Evasion Rating and Energy Shield are the standard Defences)
{ Suffix Modifier "of Defiance" (Tier: 1) }
Debuffs on Monsters expire 100% faster
{ Suffix Modifier "of Carnage" }
Monsters Maim on Hit with Attacks
(Maimed enemies have 30% reduced Movement Speed)
--------
Travel to a Map of this tier or lower by using this in a personal Map Device. Maps can only be used once.
--------
Corrupted

Modifiable only with Chaos Orbs, Vaal Orbs, Delirium Orbs and Chisels`;

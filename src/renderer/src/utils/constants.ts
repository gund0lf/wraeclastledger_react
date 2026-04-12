// ─── SCARAB LIST ──────────────────────────────────────────────────────────────
export const SCARAB_LIST: string[] = [
  // Horned
  "Horned Scarab of Awakening", "Horned Scarab of Bloodlines", "Horned Scarab of Glittering",
  "Horned Scarab of Nemeses", "Horned Scarab of Pandemonium", "Horned Scarab of Preservation",
  "Horned Scarab of Tradition",
  // Misc / new
  "Scarab of Adversaries", "Scarab of Bisection", "Scarab of the Dextral", "Scarab of Divinity",
  "Scarab of Hunted Traitors", "Scarab of Monstrous Lineage", "Scarab of Radiant Storms",
  "Scarab of the Sinistral", "Scarab of Stability", "Scarab of Wisps",
  // Abyss
  "Abyss Scarab", "Abyss Scarab of Descending", "Abyss Scarab of Edifice",
  "Abyss Scarab of Multitudes", "Abyss Scarab of Profound Depth",
  // Ambush
  "Ambush Scarab", "Ambush Scarab of Containment", "Ambush Scarab of Discernment",
  "Ambush Scarab of Hidden Compartments", "Ambush Scarab of Potency",
  // Anarchy
  "Anarchy Scarab", "Anarchy Scarab of the Exception", "Anarchy Scarab of Gigantification",
  "Anarchy Scarab of Partnership",
  // Bestiary
  "Bestiary Scarab", "Bestiary Scarab of Duplicating", "Bestiary Scarab of the Herd",
  // Betrayal
  "Betrayal Scarab", "Betrayal Scarab of the Allflame", "Betrayal Scarab of Reinforcements",
  "Betrayal Scarab of Unbreaking",
  // Beyond
  "Beyond Scarab", "Beyond Scarab of Haemophilia", "Beyond Scarab of the Invasion",
  "Beyond Scarab of Resurgence",
  // Blight
  "Blight Scarab", "Blight Scarab of Blooming", "Blight Scarab of Invigoration",
  "Blight Scarab of the Blightheart",
  // Breach
  "Breach Scarab", "Breach Scarab of Resonant Cascade", "Breach Scarab of the Hive",
  "Sinistral Breach Scarab", "Dextral Breach Scarab",
  // Cartography
  "Cartography Scarab", "Cartography Scarab of Corruption", "Cartography Scarab of Escalation",
  "Cartography Scarab of Risk", "Cartography Scarab of the Multitude",
  // Delirium
  "Delirium Scarab", "Delirium Scarab of Delusions", "Delirium Scarab of Gluttony",
  "Delirium Scarab of Neuroses", "Delirium Scarab of Paranoia",
  // Divination
  "Divination Scarab", "Divination Scarab of Pilfering", "Divination Scarab of Plenty",
  "Divination Scarab of The Cloister",
  // Domination
  "Domination Scarab", "Domination Scarab of Apparitions", "Domination Scarab of Evolution",
  "Domination Scarab of Terrors",
  // Essence
  "Essence Scarab", "Essence Scarab of Adaptation", "Essence Scarab of Ascent",
  "Essence Scarab of Calcification", "Essence Scarab of Stability",
  // Expedition
  "Expedition Scarab", "Expedition Scarab of Archaeology", "Expedition Scarab of Runefinding",
  "Expedition Scarab of Verisium Powder",
  // Harbinger
  "Harbinger Scarab", "Harbinger Scarab of Obelisks", "Harbinger Scarab of Regency",
  "Harbinger Scarab of Warhoards",
  // Harvest
  "Harvest Scarab", "Harvest Scarab of Cornucopia", "Harvest Scarab of Doubling",
  "Harvest Scarab of Midnight",
  // Incursion
  "Incursion Scarab", "Incursion Scarab of Champions", "Incursion Scarab of Invasion",
  "Incursion Scarab of Timelines",
  // Influencing
  "Influencing Scarab of Conversion", "Influencing Scarab of Hordes",
  // Kalguuran
  "Kalguuran Scarab", "Kalguuran Scarab of Guarded Riches", "Kalguuran Scarab of Refinement",
  // Legion
  "Legion Scarab", "Legion Scarab of Command", "Legion Scarab of Eternal Conflict",
  "Legion Scarab of Officers",
  // Ritual
  "Ritual Scarab", "Ritual Scarab of Abundance", "Ritual Scarab of Selectiveness",
  "Ritual Scarab of Wisps",
  // Titanic
  "Titanic Scarab", "Titanic Scarab of Legend", "Titanic Scarab of Treasures",
  // Torment
  "Torment Scarab", "Torment Scarab of Peculiarity", "Torment Scarab of Possession",
  // Ultimatum
  "Ultimatum Scarab", "Ultimatum Scarab of Bribing", "Ultimatum Scarab of Catalysing",
  "Ultimatum Scarab of Dueling", "Ultimatum Scarab of Inscription",
];

// ─── CHISEL TYPES (post-nerf, always 20% quality) ────────────────────────────
// statKey: which stat the quality bonus applies to
// bonusAt20: the flat bonus added when quality = 20 (not scaled by atlas mult)
// label: display string
export const CHISEL_TYPES: Record<string, { label: string; statKey: string; bonusAt20: number }> = {
  Avarice:      { label: "Avarice — +50% more Cu",       statKey: "moreCurrency", bonusAt20: 50  },
  Procurement:  { label: "Procurement — +40% Rarity",    statKey: "rarity",       bonusAt20: 40  },
  Proliferation:{ label: "Proliferation — +10% Pack",    statKey: "packSize",     bonusAt20: 10  },
  Scarabs:      { label: "Scarabs — +50% more Scarabs",  statKey: "moreScarabs",  bonusAt20: 50  },
  Divination:   { label: "Divination — +50% more Div",   statKey: "moreCurrency", bonusAt20: 50  },
};

// ─── QUALITY STAT EFFECTS ─────────────────────────────────────────────────────
// Maps quality type string → stat key + per-quality-point bonus multiplier
// Formula: qualBonus = quality * multiplier (e.g. 20q * 5 = 100 → +100% more currency)
// Wait that seems too high - in-game 20q Avarice chisel gives +50% more Currency total
// So multiplier should be 50/20 = 2.5
export const QUALITY_STAT_EFFECTS: Record<string, { statKey: string; multiplier: number }> = {
  Currency:      { statKey: "moreCurrency",  multiplier: 2.5 },
  Rarity:        { statKey: "rarity",        multiplier: 2   },
  "Pack Size":   { statKey: "packSize",      multiplier: 0.5 },
  Scarabs:       { statKey: "moreScarabs",   multiplier: 2.5 },
  Divination:    { statKey: "moreCurrency",  multiplier: 2.5 },
  Standard:      { statKey: "quantity",      multiplier: 0.5 },
  // Chisel key aliases (for lookup from chiselType setting)
  Avarice:       { statKey: "moreCurrency",  multiplier: 2.5 },
  Procurement:   { statKey: "rarity",        multiplier: 2   },
  Proliferation: { statKey: "packSize",      multiplier: 0.5 },
  Cartographer:  { statKey: "quantity",      multiplier: 0.5 },
};

// ─── DELIRIUM ORBS ────────────────────────────────────────────────────────────
export const DELIRIUM_ORB_LIST: { value: string; label: string }[] = [
  { value: "Abyssal",      label: "Abyssal (Abyss)" },
  { value: "Armoursmith",  label: "Armoursmith's (Armour)" },
  { value: "Blacksmith",   label: "Blacksmith's (Weapons)" },
  { value: "Blighted",     label: "Blighted (Blight)" },
  { value: "Cartographer", label: "Cartographer's (Maps)" },
  { value: "Diviner",      label: "Diviner's (Div Cards)" },
  { value: "Fine",         label: "Fine (Currency)" },
  { value: "Fossilised",   label: "Fossilised (Fossils)" },
  { value: "Fragmented",   label: "Fragmented (Fragments)" },
  { value: "Jeweller",     label: "Jeweller's (Jewels)" },
  { value: "Kalguuran",    label: "Kalguuran (Kalguur)" },
  { value: "Obscured",     label: "Obscured (Heist)" },
  { value: "Singular",     label: "Singular (Unique)" },
  { value: "Skittering",   label: "Skittering (Scarabs)" },
  { value: "Thaumaturge",  label: "Thaumaturge's (Metamorph)" },
  { value: "Timeless",     label: "Timeless (Legion)" },
  { value: "Whispering",   label: "Whispering (Essences)" },
];

// ─── ASTROLABE LIST ───────────────────────────────────────────────────────────
// Used once per map. Each adds a shaped region + encounter type.
// Format: { value, label } for Mantine Select/Autocomplete
export const ASTROLABE_LIST: { value: string; label: string }[] = [
  { value: "",                       label: "— None —" },
  { value: "Templar Astrolabe",      label: "Templar (Originator region)" },
  { value: "Chaotic Astrolabe",      label: "Chaotic (Ultimatum)" },
  { value: "Enshrouded Astrolabe",   label: "Enshrouded (Delirium Mirror)" },
  { value: "Fruiting Astrolabe",     label: "Fruiting (Harvest)" },
  { value: "Fungal Astrolabe",       label: "Fungal (Blight)" },
  { value: "Grasping Astrolabe",     label: "Grasping (Breach)" },
  { value: "Lightless Astrolabe",    label: "Lightless (Abyss)" },
  { value: "Nameless Astrolabe",     label: "Nameless (Ritual)" },
  { value: "Runic Astrolabe",        label: "Runic (Expedition)" },
  { value: "Timeless Astrolabe",     label: "Timeless (Legion)" },
];

/**
 * BUNDLED game-data manifest — revision 4 (patch 3.29 / Curse of the
 * Allflame). Revision 1 remains immutable as the published Mirage-era floor.
 *
 * SOURCE + PROVENANCE: revision 1 was generated 2026-07-06 (session 12) 1:1
 * from the flat arrays that previously lived in constants.ts. Revision 2 was
 * classified from GGG's official 3.29 notes on 2026-07-17. The Consort rename
 * was corrected from PoEDB's "Abyssal" form to GGG's official filter-list
 * spelling, "Abyss Scarab of the Consort", on 2026-07-22. constants.ts now
 * DERIVES its exports from this file; this is the single source of truth.
 * Revision 3 corrects live Allflame availability from the actual in-game item
 * list on 2026-07-29: Obscured Delirium Orb and all four Harbinger scarabs are
 * unavailable. A Faustus catalogue entry alone is not existence evidence.
 * Revision 4 classifies Cartographer's Chisel as challenge-league unavailable;
 * Standard/history remains readable, but fresh challenge input must not offer it.
 *
 * DATA NOTE (found at migration): the old SCARAB_LIST header claimed
 * "111 droppable scarabs verified for 3.28" but the array actually contained
 * 123 unique entries — the pickers have offered all 123 all along. There is
 * only ONE list (no separate "ancient" 123-list exists); the mismatch is
 * list-vs-its-own-comment. Sad (2026-07-06): vaguely recalls a past incident
 * of sources disagreeing (plausibly the same one behind plan §0's source
 * discipline); possible python-port remnants; origin no longer verifiable.
 * REVISION-2 DECISION (Sad + reviewer 2026-07-17): this app supports current
 * challenge leagues, not Standard. Standard-only survival therefore means
 * 'removed' for new-input pickers; historical entries remain in the manifest.
 * GGG's launch-day in-game filter list is the final existence authority.
 *
 * EDITING RULES (plan §2.2):
 *  - Never delete an entity — set status 'removed' instead.
 *  - Renames: keep the old entity with status 'renamed' + aliasOf -> new id.
 *  - Any change here bumps `revision` (monotonic, mid-league bumps fine).
 *  - ids are frozen at introduction (slugifyEntityId of the then-current name).
 *
 * atlasTreeVersion 3.29.0-atlas was observed on Path of Pathing 2026-07-22;
 * Sad's known 3.28 full-tree hash loaded under it with all 138/138 allocations
 * preserved and its URL remained byte-identical after initialization.
 */
import { GameDataManifest } from './types';

export const ALLFLAME_MANIFEST: GameDataManifest = {
  revision: 4,
  schemaVersion: 1,
  contextKey: 'poe1-challenge',
  patchVersion: '3.29',
  atlasTreeVersion: '3.29.0-atlas',
  mechanics: {
    scarabs: 'active',
    delirium: 'active',
    astrolabe: 'active',
    split: 'removed',
  },
  scarabs: [
  // ── Horned ──
  { id: 'horned-scarab-of-awakening', name: "Horned Scarab of Awakening", status: 'active' },
  { id: 'horned-scarab-of-bloodlines', name: "Horned Scarab of Bloodlines", status: 'active' },
  { id: 'horned-scarab-of-glittering', name: "Horned Scarab of Glittering", status: 'active' },
  { id: 'horned-scarab-of-nemeses', name: "Horned Scarab of Nemeses", status: 'active' },
  { id: 'horned-scarab-of-pandemonium', name: "Horned Scarab of Pandemonium", status: 'active' },
  { id: 'horned-scarab-of-preservation', name: "Horned Scarab of Preservation", status: 'active' },
  { id: 'horned-scarab-of-tradition', name: "Horned Scarab of Tradition", status: 'active' },
  // ── Abyss ──
  { id: 'abyss-scarab', name: "Abyss Scarab", status: 'reworked', note: "Limit 5; extra Abyss sources add two additional pits when an area already has an Abyss." },
  { id: 'abyss-scarab-of-descending', name: "Abyss Scarab of Descending", status: 'active' },
  { id: 'abyss-scarab-of-edifice', name: "Abyss Scarab of Edifice", status: 'renamed', aliasOf: 'abyss-scarab-of-crystals' },
  { id: 'abyss-scarab-of-crystals', name: "Abyss Scarab of Crystals", status: 'reworked', note: "Abyss Pits without a reward instead create an Abyssal Crystal." },
  { id: 'abyss-scarab-of-multitudes', name: "Abyss Scarab of Multitudes", status: 'reworked', note: "Abyss Chasms spawn 100% increased monsters per Soul fed." },
  { id: 'abyss-scarab-of-profound-depth', name: "Abyss Scarab of Profound Depth", status: 'renamed', aliasOf: 'abyss-scarab-of-the-consort' },
  { id: 'abyss-scarab-of-the-consort', name: "Abyss Scarab of the Consort", status: 'reworked', note: "One Abyss Pit in the area spawns an Abyssal Consort." },
  // ── Ambush ──
  { id: 'ambush-scarab', name: "Ambush Scarab", status: 'active' },
  { id: 'ambush-scarab-of-containment', name: "Ambush Scarab of Containment", status: 'active' },
  { id: 'ambush-scarab-of-discernment', name: "Ambush Scarab of Discernment", status: 'active' },
  { id: 'ambush-scarab-of-hidden-compartments', name: "Ambush Scarab of Hidden Compartments", status: 'active' },
  { id: 'ambush-scarab-of-potency', name: "Ambush Scarab of Potency", status: 'active' },
  // ── Anarchy ──
  { id: 'anarchy-scarab', name: "Anarchy Scarab", status: 'active' },
  { id: 'anarchy-scarab-of-gigantification', name: "Anarchy Scarab of Gigantification", status: 'active' },
  { id: 'anarchy-scarab-of-partnership', name: "Anarchy Scarab of Partnership", status: 'active' },
  { id: 'anarchy-scarab-of-the-exceptional', name: "Anarchy Scarab of the Exceptional", status: 'active' },
  // ── Bestiary ──
  { id: 'bestiary-scarab', name: "Bestiary Scarab", status: 'active' },
  { id: 'bestiary-scarab-of-duplicating', name: "Bestiary Scarab of Duplicating", status: 'active' },
  { id: 'bestiary-scarab-of-the-herd', name: "Bestiary Scarab of the Herd", status: 'active' },
  // ── Betrayal ──
  { id: 'betrayal-scarab', name: "Betrayal Scarab", status: 'active' },
  { id: 'betrayal-scarab-of-reinforcements', name: "Betrayal Scarab of Reinforcements", status: 'active' },
  { id: 'betrayal-scarab-of-the-allflame', name: "Betrayal Scarab of the Allflame", status: 'active' },
  { id: 'betrayal-scarab-of-unbreaking', name: "Betrayal Scarab of Unbreaking", status: 'active' },
  // ── Beyond ──
  { id: 'beyond-scarab', name: "Beyond Scarab", status: 'active' },
  { id: 'beyond-scarab-of-haemophilia', name: "Beyond Scarab of Haemophilia", status: 'active' },
  { id: 'beyond-scarab-of-resurgence', name: "Beyond Scarab of Resurgence", status: 'active' },
  { id: 'beyond-scarab-of-the-invasion', name: "Beyond Scarab of the Invasion", status: 'active' },
  // ── Blight ──
  { id: 'blight-scarab', name: "Blight Scarab", status: 'active' },
  { id: 'blight-scarab-of-blooming', name: "Blight Scarab of Blooming", status: 'active' },
  { id: 'blight-scarab-of-invigoration', name: "Blight Scarab of Invigoration", status: 'active' },
  { id: 'blight-scarab-of-the-blightheart', name: "Blight Scarab of the Blightheart", status: 'active' },
  // ── Breach ──
  { id: 'breach-scarab-of-instability', name: "Breach Scarab of Instability", status: 'active' },
  { id: 'breach-scarab-of-resonant-cascade', name: "Breach Scarab of Resonant Cascade", status: 'active' },
  { id: 'breach-scarab-of-the-hive', name: "Breach Scarab of the Hive", status: 'active' },
  { id: 'breach-scarab-of-the-incensed-swarm', name: "Breach Scarab of the Incensed Swarm", status: 'active' },
  { id: 'breach-scarab-of-the-marshal', name: "Breach Scarab of the Marshal", status: 'active' },
  // ── Cartography ──
  { id: 'cartography-scarab-of-corruption', name: "Cartography Scarab of Corruption", status: 'active' },
  { id: 'cartography-scarab-of-escalation', name: "Cartography Scarab of Escalation", status: 'active' },
  { id: 'cartography-scarab-of-risk', name: "Cartography Scarab of Risk", status: 'active' },
  { id: 'cartography-scarab-of-the-multitude', name: "Cartography Scarab of the Multitude", status: 'active' },
  // ── Delirium ──
  { id: 'delirium-scarab', name: "Delirium Scarab", status: 'active' },
  { id: 'delirium-scarab-of-delusions', name: "Delirium Scarab of Delusions", status: 'active' },
  { id: 'delirium-scarab-of-mania', name: "Delirium Scarab of Mania", status: 'active' },
  { id: 'delirium-scarab-of-neuroses', name: "Delirium Scarab of Neuroses", status: 'active' },
  { id: 'delirium-scarab-of-paranoia', name: "Delirium Scarab of Paranoia", status: 'active' },
  // ── Divination ──
  { id: 'divination-scarab-of-pilfering', name: "Divination Scarab of Pilfering", status: 'active' },
  { id: 'divination-scarab-of-plenty', name: "Divination Scarab of Plenty", status: 'active' },
  { id: 'divination-scarab-of-the-cloister', name: "Divination Scarab of The Cloister", status: 'active' },
  // ── Domination ──
  { id: 'domination-scarab', name: "Domination Scarab", status: 'active' },
  { id: 'domination-scarab-of-apparitions', name: "Domination Scarab of Apparitions", status: 'active' },
  { id: 'domination-scarab-of-evolution', name: "Domination Scarab of Evolution", status: 'active' },
  { id: 'domination-scarab-of-terrors', name: "Domination Scarab of Terrors", status: 'active' },
  // ── Essence ──
  { id: 'essence-scarab', name: "Essence Scarab", status: 'active' },
  { id: 'essence-scarab-of-adaptation', name: "Essence Scarab of Adaptation", status: 'active' },
  { id: 'essence-scarab-of-ascent', name: "Essence Scarab of Ascent", status: 'active' },
  { id: 'essence-scarab-of-calcification', name: "Essence Scarab of Calcification", status: 'active' },
  { id: 'essence-scarab-of-stability', name: "Essence Scarab of Stability", status: 'active' },
  // ── Expedition ──
  { id: 'expedition-scarab', name: "Expedition Scarab", status: 'active' },
  { id: 'expedition-scarab-of-archaeology', name: "Expedition Scarab of Archaeology", status: 'active' },
  { id: 'expedition-scarab-of-infusion', name: "Expedition Scarab of Infusion", status: 'active' },
  { id: 'expedition-scarab-of-runefinding', name: "Expedition Scarab of Runefinding", status: 'active' },
  { id: 'expedition-scarab-of-verisium-powder', name: "Expedition Scarab of Verisium Powder", status: 'active' },
  // ── Harbinger ──
  { id: 'harbinger-scarab', name: "Harbinger Scarab", status: 'removed', note: "Unavailable in Allflame's in-game item list." },
  { id: 'harbinger-scarab-of-obelisks', name: "Harbinger Scarab of Obelisks", status: 'removed', note: "Unavailable in Allflame's in-game item list." },
  { id: 'harbinger-scarab-of-regency', name: "Harbinger Scarab of Regency", status: 'removed', note: "Unavailable in Allflame's in-game item list." },
  { id: 'harbinger-scarab-of-warhoards', name: "Harbinger Scarab of Warhoards", status: 'removed', note: "Unavailable in Allflame's in-game item list." },
  // ── Harvest ──
  { id: 'harvest-scarab', name: "Harvest Scarab", status: 'active' },
  { id: 'harvest-scarab-of-cornucopia', name: "Harvest Scarab of Cornucopia", status: 'active' },
  { id: 'harvest-scarab-of-doubling', name: "Harvest Scarab of Doubling", status: 'active' },
  // ── Heist ──
  { id: 'heist-scarab', name: "Heist Scarab", status: 'removed' },
  { id: 'heist-scarab-of-lockpicking', name: "Heist Scarab of Lockpicking", status: 'removed' },
  { id: 'heist-scarab-of-many-clients', name: "Heist Scarab of Many Clients", status: 'removed' },
  { id: 'heist-scarab-of-the-wealthy', name: "Heist Scarab of the Wealthy", status: 'removed' },
  // ── Incursion ──
  { id: 'incursion-scarab', name: "Incursion Scarab", status: 'active' },
  { id: 'incursion-scarab-of-champions', name: "Incursion Scarab of Champions", status: 'active' },
  { id: 'incursion-scarab-of-invasion', name: "Incursion Scarab of Invasion", status: 'active' },
  { id: 'incursion-scarab-of-timelines', name: "Incursion Scarab of Timelines", status: 'active' },
  // ── Influencing ──
  { id: 'influencing-scarab-of-hordes', name: "Influencing Scarab of Hordes", status: 'active' },
  { id: 'influencing-scarab-of-interference', name: "Influencing Scarab of Interference", status: 'active' },
  { id: 'influencing-scarab-of-the-elder', name: "Influencing Scarab of the Elder", status: 'active' },
  { id: 'influencing-scarab-of-the-shaper', name: "Influencing Scarab of the Shaper", status: 'active' },
  // ── Kalguuran ──
  { id: 'kalguuran-scarab', name: "Kalguuran Scarab", status: 'active' },
  { id: 'kalguuran-scarab-of-enriching', name: "Kalguuran Scarab of Enriching", status: 'active' },
  { id: 'kalguuran-scarab-of-guarded-riches', name: "Kalguuran Scarab of Guarded Riches", status: 'active' },
  { id: 'kalguuran-scarab-of-refinement', name: "Kalguuran Scarab of Refinement", status: 'active' },
  // ── Legion ──
  { id: 'legion-scarab', name: "Legion Scarab", status: 'active' },
  { id: 'legion-scarab-of-eternal-conflict', name: "Legion Scarab of Eternal Conflict", status: 'active' },
  { id: 'legion-scarab-of-officers', name: "Legion Scarab of Officers", status: 'active' },
  { id: 'legion-scarab-of-treasures', name: "Legion Scarab of Treasures", status: 'active' },
  // ── Metamorph ──
  { id: 'metamorph-scarab', name: "Metamorph Scarab", status: 'removed' },
  { id: 'metamorph-scarab-of-catalogue', name: "Metamorph Scarab of Catalogue", status: 'removed' },
  { id: 'metamorph-scarab-of-curiosity', name: "Metamorph Scarab of Curiosity", status: 'removed' },
  { id: 'metamorph-scarab-of-specimen', name: "Metamorph Scarab of Specimen", status: 'removed' },
  // ── Ritual ──
  { id: 'ritual-scarab-of-abundance', name: "Ritual Scarab of Abundance", status: 'active' },
  { id: 'ritual-scarab-of-corpses', name: "Ritual Scarab of Corpses", status: 'active' },
  { id: 'ritual-scarab-of-selectiveness', name: "Ritual Scarab of Selectiveness", status: 'active' },
  { id: 'ritual-scarab-of-wisps', name: "Ritual Scarab of Wisps", status: 'active' },
  // ── Sulphite ──
  { id: 'sulphite-scarab', name: "Sulphite Scarab", status: 'active' },
  { id: 'sulphite-scarab-of-fumes', name: "Sulphite Scarab of Fumes", status: 'active' },
  // ── Titanic ──
  { id: 'titanic-scarab', name: "Titanic Scarab", status: 'active' },
  { id: 'titanic-scarab-of-legend', name: "Titanic Scarab of Legend", status: 'active' },
  { id: 'titanic-scarab-of-treasures', name: "Titanic Scarab of Treasures", status: 'active' },
  // ── Trarthan ──
  { id: 'trarthan-scarab', name: "Trarthan Scarab", status: 'active' },
  { id: 'trarthan-scarab-of-infamy', name: "Trarthan Scarab of Infamy", status: 'active' },
  { id: 'trarthan-scarab-of-renown', name: "Trarthan Scarab of Renown", status: 'active' },
  { id: 'trarthan-scarab-of-surprising-alliances', name: "Trarthan Scarab of Surprising Alliances", status: 'active' },
  // ── Torment ──
  { id: 'torment-scarab', name: "Torment Scarab", status: 'active' },
  { id: 'torment-scarab-of-peculiarity', name: "Torment Scarab of Peculiarity", status: 'active' },
  { id: 'torment-scarab-of-possession', name: "Torment Scarab of Possession", status: 'active' },
  // ── Ultimatum ──
  { id: 'ultimatum-scarab', name: "Ultimatum Scarab", status: 'active' },
  { id: 'ultimatum-scarab-of-bribing', name: "Ultimatum Scarab of Bribing", status: 'active' },
  { id: 'ultimatum-scarab-of-catalysing', name: "Ultimatum Scarab of Catalysing", status: 'active' },
  { id: 'ultimatum-scarab-of-dueling', name: "Ultimatum Scarab of Dueling", status: 'active' },
  { id: 'ultimatum-scarab-of-inscription', name: "Ultimatum Scarab of Inscription", status: 'active' },
  // ── Generic ──
  { id: 'scarab-of-adversaries', name: "Scarab of Adversaries", status: 'active' },
  { id: 'scarab-of-divinity', name: "Scarab of Divinity", status: 'active' },
  { id: 'scarab-of-monstrous-lineage', name: "Scarab of Monstrous Lineage", status: 'active' },
  { id: 'scarab-of-radiant-storms', name: "Scarab of Radiant Storms", status: 'active' },
  { id: 'scarab-of-stability', name: "Scarab of Stability", status: 'active' },
  { id: 'scarab-of-the-dextral', name: "Scarab of the Dextral", status: 'active' },
  { id: 'scarab-of-the-sinistral', name: "Scarab of the Sinistral", status: 'active' },
  { id: 'scarab-of-wisps', name: "Scarab of Wisps", status: 'active' },
  ],
  deliriumOrbs: [
  { id: 'deli-abyssal', name: "Abyssal", label: "Abyssal (Abyss)", status: 'removed' },
  { id: 'deli-armoursmith', name: "Armoursmith", label: "Armoursmith's (Armour)", status: 'active' },
  { id: 'deli-blacksmith', name: "Blacksmith", label: "Blacksmith's (Weapons)", status: 'active' },
  { id: 'deli-blighted', name: "Blighted", label: "Blighted (Blight)", status: 'active' },
  { id: 'deli-cartographer', name: "Cartographer", label: "Cartographer's (Maps)", status: 'active' },
  { id: 'deli-diviner', name: "Diviner", label: "Diviner's (Div Cards)", status: 'active' },
  { id: 'deli-fine', name: "Fine", label: "Fine (Currency)", status: 'active' },
  { id: 'deli-fossilised', name: "Fossilised", label: "Fossilised (Fossils)", status: 'removed' },
  { id: 'deli-fragmented', name: "Fragmented", label: "Fragmented (Fragments)", status: 'active' },
  { id: 'deli-jeweller', name: "Jeweller", label: "Jeweller's (Jewels)", status: 'active' },
  { id: 'deli-kalguuran', name: "Kalguuran", label: "Kalguuran (Kalguur)", status: 'removed' },
  // Faustus lists this as a possible market product, but the actual Allflame
  // item list does not contain it. Challenge-league availability governs.
  { id: 'deli-obscured', name: "Obscured", label: "Obscured (Heist)", status: 'removed', note: "Unavailable in Allflame's in-game item list." },
  { id: 'deli-singular', name: "Singular", label: "Singular (Unique)", status: 'active' },
  { id: 'deli-skittering', name: "Skittering", label: "Skittering (Scarabs)", status: 'active' },
  { id: 'deli-thaumaturge', name: "Thaumaturge", label: "Thaumaturge's (Metamorph)", status: 'active' },
  { id: 'deli-timeless', name: "Timeless", label: "Timeless (Legion)", status: 'removed' },
  { id: 'deli-whispering', name: "Whispering", label: "Whispering (Essences)", status: 'active' },
  ],
  astrolabes: [
  { id: 'templar-astrolabe', name: "Templar Astrolabe", label: "Templar (Originator region)", status: 'active' },
  { id: 'chaotic-astrolabe', name: "Chaotic Astrolabe", label: "Chaotic (Ultimatum)", status: 'active' },
  { id: 'enshrouded-astrolabe', name: "Enshrouded Astrolabe", label: "Enshrouded (Delirium Mirror)", status: 'renamed', aliasOf: 'deceptive-astrolabe' },
  { id: 'deceptive-astrolabe', name: "Deceptive Astrolabe", label: "Deceptive (Delirium Mirror)", status: 'active' },
  { id: 'fruiting-astrolabe', name: "Fruiting Astrolabe", label: "Fruiting (Harvest)", status: 'active' },
  { id: 'fungal-astrolabe', name: "Fungal Astrolabe", label: "Fungal (Blight)", status: 'active' },
  { id: 'grasping-astrolabe', name: "Grasping Astrolabe", label: "Grasping (Breach)", status: 'active' },
  { id: 'lightless-astrolabe', name: "Lightless Astrolabe", label: "Lightless (Abyss)", status: 'active' },
  { id: 'nameless-astrolabe', name: "Nameless Astrolabe", label: "Nameless (Ritual)", status: 'active' },
  { id: 'runic-astrolabe', name: "Runic Astrolabe", label: "Runic (Expedition)", status: 'active' },
  { id: 'timeless-astrolabe', name: "Timeless Astrolabe", label: "Timeless (Legion)", status: 'active' },
  ],
  chisels: [
  { id: 'chisel-cartographer', name: 'Cartographer', label: "Cartographer — +10% Quantity", status: 'removed', note: 'Unavailable in current challenge leagues; existing Standard items and historical strategies remain readable.', statKey: 'quantity', bonusAt20: 10 },
  { id: 'chisel-avarice', name: 'Avarice', label: "Avarice — +50% more Currency", status: 'active', statKey: 'moreCurrency', bonusAt20: 50 },
  { id: 'chisel-procurement', name: 'Procurement', label: "Procurement — +40% Rarity", status: 'active', statKey: 'rarity', bonusAt20: 40 },
  { id: 'chisel-proliferation', name: 'Proliferation', label: "Proliferation — +10% Pack Size", status: 'active', statKey: 'packSize', bonusAt20: 10 },
  { id: 'chisel-scarabs', name: 'Scarabs', label: "Scarabs — +50% more Scarabs", status: 'active', statKey: 'moreScarabs', bonusAt20: 50 },
  { id: 'chisel-divination', name: 'Divination', label: "Divination — +50% more Div Cards", status: 'active', statKey: 'moreDivCards', bonusAt20: 50 },
  ],
};

const activeItem = (name: string) => ({ id: name.toLowerCase().replaceAll(' ', '-'), name, status: 'active' as const });

const atlasChoices330 = {
  "27261": { name: "Celestial Presence", options: [
    { id: "15113", text: "Map Bosses" },
    { id: "62580", text: "Players" },
    { id: "24486", text: "Influenced Monsters" },
  ] },
  "53484": { name: "Runic Distortion", options: [
    { id: "33191", text: "Monsters" },
    { id: "39546", text: "Chests" },
  ] },
  "45404": { name: "Secrets Unveiled", options: [
    { id: "55878", text: "Immortal Syndicate Members in your Maps have 25% chance to\ndrop an additional Double-Veiled Item" },
    { id: "5301", text: "4% chance for Veiled Items found in your Maps to drop as Allflames instead" },
  ] },
  "63533": { name: "Reality Tether", options: [
    { id: "57043", text: "Tormented Spirits in your Maps have 100% increased Duration" },
    { id: "42022", text: "Tormented Spirits in your Maps cannot be Damaged" },
  ] },
  "19729": { name: "Divide and Conquer", options: [
    { id: "22188", text: "Hives" },
    { id: "5397", text: "Unstable Breaches" },
  ] },
  "55213": { name: "Fated Meeting", options: [
    { id: "64586", text: "Tormented Smuggler" },
    { id: "59843", text: "Tormented Embezzler" },
    { id: "35863", text: "Tormented Heretic" },
  ] },
  "712": { name: "Outside Entities", options: [
    { id: "17864", text: "Your Maps have 40% increased chance to contain a Mirror of Delirium" },
    { id: "40579", text: "Your Maps have 40% increased chance to contain a Demonic Evocator" },
    { id: "61631", text: "Your Maps have 40% increased chance to contain the Viridian Wildwood" },
    { id: "8618", text: "Your Maps have 40% increased chance to contain a Mirage" },
    { id: "50999", text: "Your Maps have 40% increased chance to contain a Buried Sentinel" },
  ] },
  "28029": { name: "Path of Worship", options: [
    { id: "40883", text: "Covetous Shrine" },
    { id: "36379", text: "Acceleration Shrine" },
    { id: "9032", text: "Gloom Shrine" },
  ] },
  "12826": { name: "Arboriculture", options: [
    { id: "10181", text: "Vivid Roots" },
    { id: "47548", text: "Wild Roots" },
    { id: "13897", text: "Primal Roots" },
  ] },
  "48364": { name: "Fertile Ground", options: [
    { id: "1963", text: "Provisioning" },
    { id: "56958", text: "Lavish" },
    { id: "64808", text: "Ancient" },
    { id: "62656", text: "Mysterious" },
  ] },
  "28477": { name: "Malignant Modifiers", options: [
    { id: "49076", text: "25% increased effect of Prefix Modifiers on your Maps" },
    { id: "17503", text: "25% increased effect of Suffix Modifiers on your Maps" },
  ] },
  "3926": { name: "Suffused with Darkness", options: [
    { id: "2215", text: "Abyss Jewels found in your Maps have 25% chance to be Corrupted\nand have 5 or 6 random Modifiers" },
    { id: "38495", text: "Abyss Jewels found in your Maps have 25% chance to have a Veiled Modifier" },
  ] },
  "56429": { name: "Unbecoming Emotion", options: [
    { id: "5899", text: "Woe" },
    { id: "52262", text: "Greed" },
    { id: "13574", text: "Doubt" },
    { id: "53137", text: "Rage" },
    { id: "22483", text: "Spite" },
    { id: "41971", text: "Sorrow" },
  ] },
  "41332": { name: "Repressed Emotion", options: [
    { id: "39523", text: "Anguish" },
    { id: "46511", text: "Torment" },
    { id: "6505", text: "Suffering" },
    { id: "50056", text: "Fear" },
    { id: "31550", text: "Zeal" },
    { id: "45357", text: "Loathing" },
  ] },
  "39977": { name: "Blood Feud", options: [
    { id: "61534", text: "Legion Encounters in your Maps have 100% increased chance to include a Karui army · Legion Generals in your Maps have 30% increased chance to drop\na Karui Enshrouding Crystal" },
    { id: "34298", text: "Legion Encounters in your Maps have 100% increased chance to include an Eternal Empire army · Legion Generals in your Maps have 30% increased chance to drop\nan Imperial Enshrouding Crystal" },
    { id: "35722", text: "Legion Encounters in your Maps have 100% increased chance to include a Vaal army · Legion Generals in your Maps have 30% increased chance to drop\na Vaal Enshrouding Crystal" },
    { id: "35281", text: "Legion Encounters in your Maps have 80% increased chance to include a Templar army · Legion Generals in your Maps have 30% increased chance to drop\na Templar Enshrouding Crystal" },
    { id: "64739", text: "Legion Encounters in your Maps have 60% increased chance to include a Maraketh army · Legion Generals in your Maps have 30% increased chance to drop\na Maraketh Enshrouding Crystal" },
  ] },
  "42092": { name: "Ill Feeling", options: [
    { id: "42547", text: "Misery" },
    { id: "30259", text: "Scorn" },
    { id: "3743", text: "Dread" },
    { id: "2272", text: "Envy" },
  ] },
  "50917": { name: "Buried Feeling", options: [
    { id: "53191", text: "Anger" },
    { id: "56739", text: "Hatred" },
    { id: "13246", text: "Wrath" },
    { id: "22534", text: "Contempt" },
  ] },
  "64980": { name: "Threadbare", options: [
    { id: "53700", text: "Breach" },
    { id: "44382", text: "Ritual" },
    { id: "48744", text: "Ultimatum" },
    { id: "43149", text: "Expedition" },
    { id: "8451", text: "Incursion" },
  ] },
  "61484": { name: "Sinistral Threads", options: [
    { id: "47843", text: "Abyss" },
    { id: "29857", text: "Bestiary" },
    { id: "14897", text: "Blight" },
    { id: "1451", text: "Betrayal" },
    { id: "44328", text: "Legion" },
  ] },
  "61698": { name: "Merged Worlds", options: [
    { id: "9590", text: "Your Maps have +20% chance to contain Ore Deposits" },
    { id: "60065", text: "Your Maps have +50% Surpassing Chance to contain a Strongbox" },
    { id: "50909", text: "Your Maps have +20% chance to be inhabited by a Mercenary" },
    { id: "11679", text: "Your Maps have +50% Surpassing Chance to contain a Rogue Exile" },
  ] },
  "12887": { name: "Blended Realities", options: [
    { id: "51599", text: "Your Maps have +30% Surpassing Chance to contain Sacred Flora" },
    { id: "57448", text: "Your Maps have +50% Surpassing Chance to be haunted by a Tormented Spirit" },
    { id: "33096", text: "Your Maps have +50% Surpassing Chance to contain an Imprisoned Monster" },
    { id: "20818", text: "Your Maps have +50% Surpassing Chance to contain a Shrine" },
  ] },
  "61620": { name: "Unthreaded", options: [
    { id: "30960", text: "Abyss" },
    { id: "31094", text: "Bestiary" },
    { id: "59208", text: "Blight" },
    { id: "57958", text: "Betrayal" },
    { id: "6251", text: "Legion" },
  ] },
  "54685": { name: "Dextral Threads", options: [
    { id: "52289", text: "Breach" },
    { id: "36845", text: "Ritual" },
    { id: "64463", text: "Ultimatum" },
    { id: "46985", text: "Expedition" },
    { id: "56313", text: "Incursion" },
  ] },
  "7788": { name: "Kalguuran Companionship", options: [
    { id: "15072", text: "Expeditions in your Maps have 150% increased chance to be led by Rog" },
    { id: "23532", text: "Expeditions in your Maps have 150% increased chance to be led by Gwennen" },
    { id: "131", text: "Expeditions in your Maps have 150% increased chance to be led by Tujen" },
    { id: "53929", text: "Expeditions in your Maps have 75% increased chance to be led by Dannig" },
  ] },
  "42725": { name: "Controlled Chaos", options: [
    { id: "24969", text: "Ultimatum Encounters in your Maps have 100% increased chance to\nrequire you to protect the Altar · Ultimatum Altars in your Maps have 75% increased Life" },
    { id: "34210", text: "Ultimatum Encounters in your Maps have 100% increased chance to\nrequire you to defeat waves of Enemies · Ultimatum Encounters in your Maps requiring you to Defeat waves of Enemies\nrequire killing 30% reduced number of Enemies" },
    { id: "41920", text: "Ultimatum Encounters in your Maps have 100% increased chance to\nrequire you to Stand in the Stone Circles · Ultimatum Stone Circles in your Maps have 40% increased radius" },
    { id: "14502", text: "Ultimatum Encounters in your Maps have 100% increased chance to\nonly require you to Survive · Ultimatum Encounters in your Maps only requiring you to Survive\nhave 30% reduced duration" },
  ] },
  "7018": { name: "Hunting Grounds", options: [
    { id: "16876", text: "The Deep" },
    { id: "36075", text: "The Wilds" },
    { id: "31688", text: "The Caverns" },
    { id: "31858", text: "The Sands" },
  ] },
  "44063": { name: "Augured Cache", options: [
    { id: "35745", text: "Diviner's" },
    { id: "57438", text: "Cartographer's" },
    { id: "20208", text: "Arcanist's · Artisan's" },
  ] },
  "5138": { name: "Trialmaster's Boon", options: [
    { id: "27227", text: "Inscribed Ultimatums found in your Maps have 80% increased chance to reward Currency Items · Ultimatum Rewards in your Maps have 80% increased chance to be Currency Items" },
    { id: "7876", text: "Inscribed Ultimatums found in your Maps have 80% increased chance to reward Unique Items · Ultimatum Rewards in your Maps have 80% increased chance to be Unique Items" },
    { id: "904", text: "Inscribed Ultimatums found in your Maps have 80% increased chance to reward Divination Cards · Ultimatum Rewards in your Maps have 80% increased chance to be Divination Cards" },
  ] },
  "23538": { name: "Time Dilation", options: [
    { id: "49708", text: "Time gained from Kills is Doubled for Incursions in your Maps" },
    { id: "3497", text: "Time gained from Kills is Halved for Incursions in your Maps · Incursions in your Maps have 25% increased Pack Size" },
  ] },
  "36870": { name: "Controlled Detonation", options: [
    { id: "3172", text: "Expedition Detonation Chains in your Maps travel 50% slower" },
    { id: "8905", text: "Expedition Detonation Chains in your Maps travel 50% faster" },
  ] },
  "37454": { name: "Power Struggle", options: [
    { id: "32542", text: "Killing non-resident Architects in your Maps adds an additional Upgrade Tier\nto the surviving Architect's Room" },
    { id: "54543", text: "Killing resident Architects in your Maps adds their Upgrade Tier\nto the surviving Architect's Room" },
  ] },
  "16487": { name: "Trarthan Policy", options: [
    { id: "64303", text: "Strength aligned" },
    { id: "29138", text: "Dexterity aligned" },
    { id: "9802", text: "Intelligence aligned" },
  ] },
  "33916": { name: "House Supremacy", options: [
    { id: "14632", text: "Marauder" },
    { id: "11906", text: "Duelist" },
    { id: "9199", text: "Templar" },
    { id: "43936", text: "Witch" },
    { id: "46989", text: "Shadow" },
    { id: "65122", text: "Ranger" },
    { id: "30397", text: "Scion" },
  ] },
};

export const BUNDLED_MANIFEST: GameDataManifest = {
  ...ALLFLAME_MANIFEST,
  atlasCompletion: { objectives: 100, itemQuantity: 25 },
  revision: 7,
  schemaVersion: 2,
  patchVersion: '3.30',
  atlasTreeVersion: '3.30.0-atlas',
  atlasTrees: {
    '3.28.0-atlas': { layout: '3.28', maxPoints: 138 },
    '3.28.0-atlas-league': { layout: '3.28', maxPoints: 138 },
    '3.29.0-atlas': { layout: '3.28', maxPoints: 138 },
    '3.30.0-atlas': { layout: '3.30', maxPoints: 150, choices: atlasChoices330 },
  },
  leagueRules: { Covens: { atlasDrops: true, threadSlots: 3, threadCap: 8, atlasTreeVersion: '3.30.0-atlas', deliriumOrbs: 'reforge' } },
  legacyDeliriumLayerLeagues: ['Allflame', 'Mirage', 'Ancestors'],
  mechanics: { ...ALLFLAME_MANIFEST.mechanics, scarabs: 'removed', threads: 'active' },
  scarabs: ALLFLAME_MANIFEST.scarabs.map(item => item.status === 'renamed' ? item : { ...item, status: 'removed' }),
  threads: ['Abyss', 'Bestiary', 'Betrayal', 'Blight', 'Breach', 'Expedition', 'Incursion', 'Legion', 'Ritual', 'Ultimatum']
    .map(name => activeItem(name + ' Thread')),
  embers: ['Flesh', 'Propagation', 'the Cloister', 'the Divine', 'the Gilded', 'Kulemak', 'Resplendence', 'the Ethereal', 'the Multitude', 'the Wildwood', 'Toads']
    .map(name => activeItem('Allflame Ember of ' + name)),
  astrolabes: [
    ...ALLFLAME_MANIFEST.astrolabes.map(item => ['templar-astrolabe', 'deceptive-astrolabe', 'fruiting-astrolabe'].includes(item.id)
      ? { ...item, status: 'removed' as const } : item),
    { ...activeItem('Prospecting Astrolabe'), status: 'removed' },
    ...['Immortal', 'Feral', 'Royal', 'Cryptic'].map(name => activeItem(name + ' Astrolabe')),
  ],
  deliriumOrbs: [
    ...ALLFLAME_MANIFEST.deliriumOrbs.map(item => {
      if (item.id === 'deli-skittering') return { ...item, status: 'renamed' as const, aliasOf: 'deli-threaded' };
      if (item.id === 'deli-fragmented') return { ...item, status: 'removed' as const };
      return item;
    }),
    { id: 'deli-threaded', name: 'Threaded', label: 'Threaded (Threads)', status: 'active' },
  ],
  chisels: [
    ...ALLFLAME_MANIFEST.chisels.map(item => {
      if (item.id === 'chisel-scarabs') return { ...item, status: 'renamed' as const, aliasOf: 'chisel-threads' };
      if (item.id === 'chisel-procurement') return { ...item, status: 'reworked' as const, label: 'Procurement — +25% Rarity', bonusAt20: 25 };
      return item;
    }),
    { id: 'chisel-threads', name: 'Threads', label: 'Threads — +50% more Threads', status: 'active', statKey: 'moreThreads', bonusAt20: 50 },
  ],
};

/**
 * BUNDLED game-data manifest — revision 2 (patch 3.29 / Curse of the
 * Allflame). Revision 1 remains immutable as the published Mirage-era floor.
 *
 * SOURCE + PROVENANCE: revision 1 was generated 2026-07-06 (session 12) 1:1
 * from the flat arrays that previously lived in constants.ts. Revision 2 was
 * classified from GGG's official 3.29 notes on 2026-07-17, with exact Consort
 * spelling cross-checked against the PoEDB 3.29 mirror. constants.ts now
 * DERIVES its exports from this file; this is the single source of truth.
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
 * atlasTreeVersion is '' — the pathofpathing ?v= string for 3.29 has not been
 * OBSERVED yet ('' is a loud unknown, not a guess; §5.4 Tier 1 parse fills it).
 */
import { GameDataManifest } from './types';

export const BUNDLED_MANIFEST: GameDataManifest = {
  revision: 2,
  schemaVersion: 1,
  contextKey: 'poe1-challenge',
  patchVersion: '3.29',
  atlasTreeVersion: '',
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
  { id: 'abyss-scarab-of-profound-depth', name: "Abyss Scarab of Profound Depth", status: 'renamed', aliasOf: 'abyssal-scarab-of-the-consort' },
  { id: 'abyssal-scarab-of-the-consort', name: "Abyssal Scarab of the Consort", status: 'reworked', note: "One Abyss Pit in the area spawns an Abyssal Consort." },
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
  { id: 'harbinger-scarab', name: "Harbinger Scarab", status: 'active' },
  { id: 'harbinger-scarab-of-obelisks', name: "Harbinger Scarab of Obelisks", status: 'active' },
  { id: 'harbinger-scarab-of-regency', name: "Harbinger Scarab of Regency", status: 'active' },
  { id: 'harbinger-scarab-of-warhoards', name: "Harbinger Scarab of Warhoards", status: 'active' },
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
  { id: 'deli-obscured', name: "Obscured", label: "Obscured (Heist)", status: 'removed' },
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
  { id: 'chisel-cartographer', name: 'Cartographer', label: "Cartographer — +10% Quantity", status: 'active', statKey: 'quantity', bonusAt20: 10 },
  { id: 'chisel-avarice', name: 'Avarice', label: "Avarice — +50% more Currency", status: 'active', statKey: 'moreCurrency', bonusAt20: 50 },
  { id: 'chisel-procurement', name: 'Procurement', label: "Procurement — +40% Rarity", status: 'active', statKey: 'rarity', bonusAt20: 40 },
  { id: 'chisel-proliferation', name: 'Proliferation', label: "Proliferation — +10% Pack Size", status: 'active', statKey: 'packSize', bonusAt20: 10 },
  { id: 'chisel-scarabs', name: 'Scarabs', label: "Scarabs — +50% more Scarabs", status: 'active', statKey: 'moreScarabs', bonusAt20: 50 },
  { id: 'chisel-divination', name: 'Divination', label: "Divination — +50% more Div Cards", status: 'active', statKey: 'moreDivCards', bonusAt20: 50 },
  ],
};

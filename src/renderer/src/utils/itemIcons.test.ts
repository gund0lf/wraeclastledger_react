/**
 * itemIcons.test.ts — icon resolver, incl. the WP6-prerequisite regression:
 * the removed containment sweep must never come back. Uncached unique names
 * (Forbidden Flame) used to resolve to whatever cached key happened to share
 * a prefix relationship (observed: the Chaos Orb icon). Wrong icon > blank
 * was the failure; blank is the correct answer now.
 *
 * poe.ninja is mocked at the window.api boundary; league detection is mocked
 * so buildCache doesn't probe.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';

const iconLeagueState = vi.hoisted(() => ({ current: 'Ancestors' }));

vi.mock('./league', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./league')>();
  return { ...actual, getCurrentLeague: async () => iconLeagueState.current };
});

const CHAOS_URL  = 'https://web.poecdn.com/gen/image/chaos.png';
const ABYSS_URL  = 'https://web.poecdn.com/gen/image/abyss-scarab.png';
const WINGED_URL = 'https://web.poecdn.com/gen/image/winged-abyss.png';
const GEM_URL    = 'https://web.poecdn.com/gen/image/empower-support.png';
const CHISEL_URL = 'https://web.poecdn.com/gen/image/scarab-chisel.png';
const BLUNDERBORE_URL = 'https://web.poecdn.com/gen/image/blunderbore.png';
const RALAKESH_URL = 'https://web.poecdn.com/gen/image/ralakesh.png';
const EPHEMERAL_URL = 'https://web.poecdn.com/gen/image/ephemeral-edge.png';
const DISSOLUTION_URL = 'https://web.poecdn.com/gen/image/dissolution.png';
const INVITATION_URL = 'https://web.poecdn.com/gen/image/incandescent-invitation.png';
const BEAST_URL = 'https://web.poecdn.com/gen/image/bestiary-orb-full.png';
const CROAKER_TALISMAN_URL = 'https://web.poecdn.com/gen/image/croaker-talisman.png';
const GREAT_MAW_TALISMAN_URL = 'https://web.poecdn.com/gen/image/great-maw-talisman.png';
const ASTROLABE_NAMES = [
  'Templar Astrolabe', 'Chaotic Astrolabe', 'Deceptive Astrolabe',
  'Fruiting Astrolabe', 'Fungal Astrolabe', 'Grasping Astrolabe',
  'Lightless Astrolabe', 'Nameless Astrolabe', 'Runic Astrolabe',
  'Timeless Astrolabe',
];
const ASTROLABE_URL = 'https://web.poecdn.com/gen/image/astrolabe.png';
const generatedMapUrl = (tier: number, flags: Record<string, unknown> = {}) => {
  const descriptor = [28, 14, {
    f: `2DItems/Maps/Atlas2Maps/New/MapNumbers${tier}`,
    w: 1, h: 1, scale: 1, mn: 24, mt: 0, ...flags,
  }];
  const encoded = btoa(JSON.stringify(descriptor)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `https://web.poecdn.com/gen/image/${encoded}/test/MapNumbers${tier}.png`;
};
// Map shapes mirror the live poe.ninja response verified 2026-07-15. The
// descriptor flags carry overlays: mc = conqueror, mb = Blight, me = event.
const VAALTEMPLE_URL = 'https://web.poecdn.com/gen/image/VaalTemple3.png';
const BARAN16_URL    = generatedMapUrl(16, { mc: 1 });
const NIGHTMARE_URL  = 'https://web.poecdn.com/gen/image/NightmareMapSymbol.png';
const BLIGHT14_URL   = generatedMapUrl(14, { mb: true });
const BLIGHT16_URL   = generatedMapUrl(16, { mb: true });
const PLAIN1_URL     = generatedMapUrl(1);
const PLAIN16_URL    = generatedMapUrl(16);
const ALLFLAME16_URL = generatedMapUrl(16, { mm: true });
const EVENT9_URL     = generatedMapUrl(9, { me: true });
const EVENT15_URL    = generatedMapUrl(15, { me: true });
// Standard's legacy line remains deliberately undecodable so it cannot beat
// clean current-league art derived from a real descriptor.
const LEGACY14_URL     = 'https://web.poecdn.com/gen/image/Legacy-RomanXIV.png';
const LEGACY_CHAOS_URL = 'https://web.poecdn.com/gen/image/legacy-chaos.png';
const PRECISION_URL    = 'https://web.poecdn.com/gen/image/AccuracyandCriticalChanceAura.png';
const FLAME_URL        = 'https://web.poecdn.com/gen/image/PuzzlePieceJewel_CleansingFire.png';
const FLESH_URL        = 'https://web.poecdn.com/gen/image/PuzzlePieceJewel_Chaos.png';

const fetchedLeagues = new Set<string>();
const fetchCounts = new Map<string, number>();

beforeAll(() => {
  (globalThis as any).window = {
    api: {
      fetchEconomyIcons: async (_family: string, league: string, type: string) => {
        fetchedLeagues.add(league);
        fetchCounts.set(league, (fetchCounts.get(league) ?? 0) + 1);
        if (type === 'Currency') return { icons: [
          // Standard serves DIFFERENT art for the same key — first-write-wins
          // means the challenge league's CHAOS_URL must survive.
          { name: 'Chaos Orb',      icon: league === 'Standard' ? LEGACY_CHAOS_URL : CHAOS_URL },
          { name: "Maven's Chisel of Scarabs", icon: CHISEL_URL },
        ], slugs: [] };
        if (type === 'Scarab')   return { icons: [
          { name: 'Abyss Scarab',        icon: ABYSS_URL },
          { name: 'Winged Abyss Scarab', icon: WINGED_URL },
        ], slugs: [] };
        if (type === 'DivinationCard') return {
          icons: [],
          slugs: ['the-doctor', 'darker-half', 'time-lost-relic', 'the-reflection-of-the-heart'],
          names: ['The Doctor', 'Darker Half', 'Time-Lost Relic', 'Reflection of the Heart'],
        };
        if (type === 'Astrolabe') return { icons: ASTROLABE_NAMES.map((name) => ({
          name, icon: ASTROLABE_URL,
        })), slugs: [] };
        if (type === 'UniqueArmour') return { icons: [
          { name: 'Blunderbore', icon: BLUNDERBORE_URL },
          { name: "Ralakesh's Impatience", icon: RALAKESH_URL },
        ], slugs: [] };
        if (type === 'UniqueWeapon') return { icons: [
          { name: 'Ephemeral Edge', icon: EPHEMERAL_URL },
        ], slugs: [] };
        if (type === 'Map') {
          if (league === 'Standard') return { icons: [
            { name: 'Map (Tier 14)', icon: LEGACY14_URL }, // legacy Roman-numeral art
          ], slugs: [] };
          return { icons: [
            { name: 'Al-Hezmin Vaal Temple Map', icon: VAALTEMPLE_URL }, // deliberately FIRST, as live
            { name: 'Baran Map (Tier 16)',       icon: BARAN16_URL },
            { name: 'Map (Tier 1)',              icon: PLAIN1_URL },
            { name: 'Map (Tier 9)',              icon: EVENT9_URL },
            { name: 'Map (Tier 16)',             icon: ALLFLAME16_URL },
            { name: 'Map (Tier 15)',             icon: EVENT15_URL },
            { name: 'Nightmare Map',             icon: NIGHTMARE_URL },
          ], slugs: [] };
        }
        if (type === 'BlightedMap') return { icons: [
          { name: 'Blighted Map (Tier 14)', icon: BLIGHT14_URL },
          { name: 'Blighted Map (Tier 16)', icon: BLIGHT16_URL },
        ], slugs: [] };
        if (type === 'SkillGem') return { icons: [
          { name: 'Empower Support', icon: GEM_URL },
          { name: 'Precision', icon: PRECISION_URL },
        ], slugs: [] };
        if (type === 'UniqueJewel') return { icons: [
          // poe.ninja DOES list these (verified live 2026-07-09) — the
          // WP6-era "not cached" assumption was wrong; they were only ever
          // supposed to not resolve WRONGLY.
          { name: 'Forbidden Flame', icon: FLAME_URL },
          { name: 'Forbidden Flesh', icon: FLESH_URL },
          { name: 'Dissolution of the Flesh', icon: DISSOLUTION_URL },
        ], slugs: [] };
        if (type === 'Invitation') return { icons: [
          { name: 'Incandescent Invitation', icon: INVITATION_URL },
        ], slugs: [] };
        if (type === 'Beast') return { icons: [
          { name: 'Craicic Croaker', icon: BEAST_URL },
          { name: 'Wild Hellion Alpha', icon: BEAST_URL },
        ], slugs: [] };
        if (type === 'BaseType') return { icons: [
          { name: 'Croaker Talisman', icon: CROAKER_TALISMAN_URL },
          { name: 'Great Maw Talisman', icon: GREAT_MAW_TALISMAN_URL },
        ], slugs: [] };
        return { icons: [], slugs: [] };
      },
    },
  };
});

import {
  getItemIcons, clearIconCache, chiselItemName, deliOrbItemName, decodeIconDescriptor,
  GENERIC_BLUEPRINT,
} from './itemIcons';

describe('decodeIconDescriptor()', () => {
  it('decodes clean and composited map descriptors without network access', () => {
    expect(decodeIconDescriptor(PLAIN16_URL)).toMatchObject({
      f: '2DItems/Maps/Atlas2Maps/New/MapNumbers16', mn: 24, mt: 0,
    });
    expect(decodeIconDescriptor(BLIGHT14_URL)).toMatchObject({ mb: true });
    expect(decodeIconDescriptor(BARAN16_URL)).toMatchObject({ mc: 1 });
    expect(decodeIconDescriptor(ALLFLAME16_URL)).toMatchObject({ mm: true });
    expect(GENERIC_BLUEPRINT).toBe('https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvSGVpc3QvQmx1ZXByaW50Tm90QXBwcm92ZWQ3IiwidyI6MSwiaCI6MSwic2NhbGUiOjF9XQ/bafd718e24/BlueprintNotApproved7.png');
    expect(decodeIconDescriptor(GENERIC_BLUEPRINT)).toMatchObject({
      f: '2DItems/Currency/Heist/BlueprintNotApproved7',
    });
    expect(decodeIconDescriptor('https://example.com/not-generated.png')).toBeNull();
    expect(decodeIconDescriptor('https://web.poecdn.com/gen/image/not-base64/x/y.png')).toBeNull();
  });
});

describe('itemIcons resolve()', () => {
  it('exact and normalised matches still work', async () => {
    clearIconCache();
    const { resolve } = await getItemIcons();
    // Also guards FIRST-write-wins: the Standard mock serves legacy art for
    // this same key, and it must NOT win.
    expect(resolve('Chaos Orb')).toBe(CHAOS_URL);
    expect(resolve('chaos  orb')).toBe(CHAOS_URL); // normalised
  });

  it('word-boundary prefix works: suffixed scarab resolves to its base', async () => {
    const { resolve } = await getItemIcons();
    expect(resolve('Abyss Scarab of Edifice')).toBe(ABYSS_URL);
  });

  it('REGRESSION: uncached unique names return undefined, never a wrong icon', async () => {
    const { resolve } = await getItemIcons();
    // With the containment sweep, uncached names resolved to arbitrary
    // cached icons (observed live: Chaos Orb). Correct behavior is blank.
    // (Forbidden Flame/Flesh moved out of this test in session 17: ninja
    // lists them under UniqueJewel, so they now resolve to their OWN icons.)
    expect(resolve('Mageblood')).toBeUndefined();
    expect(resolve('Mageblood')).not.toBe(CHAOS_URL);
  });

  it('uniques: variant-first WealthyExile forms resolve via comma segments', async () => {
    const { resolve } = await getItemIcons();
    // Fixture-verified shape: "Focal Point, Forbidden Flame" — allocated
    // passive first, item name last. Segments are retried item-name-first.
    expect(resolve('Focal Point, Forbidden Flame')).toBe(FLAME_URL);
    expect(resolve('Doryani, Forbidden Flesh')).toBe(FLESH_URL);
    // Plain names hit exact as usual.
    expect(resolve('Forbidden Flame')).toBe(FLAME_URL);
  });

  it('gems: WealthyExile "- lvl/qual" suffixed names resolve to the base gem', async () => {
    const { resolve } = await getItemIcons();
    // Fixture-verified shape: "Precision - 21/20 corrupted".
    expect(resolve('Precision - 21/20 corrupted')).toBe(PRECISION_URL);
    expect(resolve('Precision - 1/0')).toBe(PRECISION_URL);
  });

  it('numeric suffixes do not make an unknown item a gem', async () => {
    const { resolve } = await getItemIcons();
    // WealthyExile uses this same numeric shape for Blueprint wings, so the
    // suffix cannot independently authorize a gem fallback.
    expect(resolve('Blueprint: Underbelly - 1/3')).toBe(GENERIC_BLUEPRINT);
    expect(resolve('Blueprint: Tunnels - 1/3')).not.toBe(GEM_URL);
  });

  it('uses the bounded official-CDN Blueprint fallback only for Blueprint-labelled names', async () => {
    const { resolve } = await getItemIcons();
    expect(resolve('Blueprint: Bunker - 1/3')).toBe(GENERIC_BLUEPRINT);
    expect(resolve('Unpriced Blueprint')).toBe(GENERIC_BLUEPRINT);
    expect(resolve('Architects Hand')).toBeUndefined();
  });

  it('resolves the supplied exact beast, Astrolabe, unique, gem and invitation identities', async () => {
    const { resolve } = await getItemIcons();
    expect(resolve('Craicic Croaker')).toBe(BEAST_URL);
    expect(resolve('Wild Hellion Alpha')).toBe(BEAST_URL);
    for (const name of ASTROLABE_NAMES) expect(resolve(name)).toBe(ASTROLABE_URL);
    expect(resolve("Ralakesh's Impatience")).toBe(RALAKESH_URL);
    expect(resolve('Ephemeral Edge')).toBe(EPHEMERAL_URL);
    expect(resolve('Dissolution of the Flesh')).toBe(DISSOLUTION_URL);
    expect(resolve('Empower Support - 1/0')).toBe(GEM_URL);
    expect(resolve('Incandescent Invitation')).toBe(INVITATION_URL);
  });

  it('resolves exact base-item identities from the stash BaseType feed', async () => {
    const { resolve } = await getItemIcons();
    expect(resolve('Croaker Talisman')).toBe(CROAKER_TALISMAN_URL);
    expect(resolve('Great Maw Talisman')).toBe(GREAT_MAW_TALISMAN_URL);
  });

  it('six-link suffixes resolve unique armour by its base name', async () => {
    const { resolve } = await getItemIcons();
    expect(resolve('Blunderbore 6L')).toBe(BLUNDERBORE_URL);
  });

  it('uncached scarabs never borrow a different scarab or chisel identity', async () => {
    const { resolve } = await getItemIcons();
    expect(resolve('Titanic Scarab')).toBeUndefined();
    expect(resolve('Heist Scarab')).toBeUndefined();
    expect(resolve('Heist Scarab')).not.toBe(ABYSS_URL);
    expect(resolve('Heist Scarab')).not.toBe(CHISEL_URL);
  });

  it('event leagues also pull the parent league + Standard (KNOWN_LEAGUES-driven)', async () => {
    await getItemIcons(); // cache already built by earlier tests; ensure resolved
    // getCurrentLeague is mocked to 'Ancestors'; the real KNOWN_LEAGUES lists
    // Mirage below it. buildCache must fetch all three — event economies are
    // thin, the parent league carries the icon coverage.
    expect([...fetchedLeagues].sort()).toEqual(['Ancestors', 'Mirage', 'Standard']);
  });

  it('rebuilds the cache when the active league changes', async () => {
    await getItemIcons();
    const mirageFetchesBefore = fetchCounts.get('Mirage') ?? 0;

    iconLeagueState.current = 'Mirage';
    await getItemIcons();

    expect(fetchCounts.get('Mirage')).toBeGreaterThan(mirageFetchesBefore);
    iconLeagueState.current = 'Ancestors';
    clearIconCache();
  });

  it('known div-card display names resolve to the shared card inventory icon', async () => {
    const { resolve } = await getItemIcons();
    // 'Darker Half' has no "The"-prefix so it skips pickGeneric's div-card
    // heuristic and lands on the display-name set. ('The Doctor' hits the heuristic.)
    expect(resolve('Darker Half')).toContain('Divination');
    expect(resolve('The Doctor')).toContain('Divination');
    expect(resolve('Time-Lost Relic')).toContain('Divination');
    // Live slug includes an extra leading article; only items[].name is exact.
    expect(resolve('Reflection of the Heart')).toContain('Divination');
  });

  it('REGRESSION: pickGeneric keywords are whole-word, not substrings', async () => {
    const { resolve } = await getItemIcons();
    // GENERIC.gem is seeded from the cached "Empower Support" icon. The old
    // substring check matched 'gem' inside "gemcutters" (Gemcutter's Prism
    // normalises to "gemcutters prism") and handed it the gem icon. The
    // whole-word boundary must reject that while still catching a real gem.
    // (key/coin/omen/fog/mist/relic got the same whole-word treatment.)
    expect(resolve("Gemcutter's Prism")).not.toBe(GEM_URL);
    expect(resolve("Gemcutter's Prism")).toBeUndefined();
    // A genuine trailing "... Gem" (no support/awakened/etc. keyword) still
    // resolves via the whole-word match.
    expect(resolve('Portal Gem')).toBe(GEM_URL);
  });

  it('REGRESSION: uncached "...Orb" names return undefined, never the Chaos Orb icon', async () => {
    const { resolve } = await getItemIcons();
    // The last-resort /\borb\b/ -> chaos_orb fallback was removed in session 17:
    // real currency orbs all resolve exactly, so it only ever fired on orbs
    // poe.ninja does NOT price — and painted them as Chaos Orbs (confirmed
    // live: Imprinted Bestiary Orb). Blank is the correct answer.
    expect(resolve('Imprinted Bestiary Orb')).toBeUndefined();
    expect(resolve('Bestiary Orb')).toBeUndefined();
    expect(resolve('Imprinted Bestiary Orb')).not.toBe(CHAOS_URL);
  });

  it('maps: tierless conqueror rows resolve to their real tiered icon, not a generic', async () => {
    const { resolve } = await getItemIcons();
    // WealthyExile exports "Baran Map" (no tier); poe.ninja's key is
    // "Baran Map (Tier 16)". The tier probe must find the REAL icon — this
    // used to fall to the order-arbitrary generic (Vaal Temple art, live).
    expect(resolve('Baran Map')).toBe(BARAN16_URL);
    expect(resolve('Baran Map')).not.toBe(VAALTEMPLE_URL);
  });

  it('maps: a tier only present through Blight does not borrow the Blighted art', async () => {
    const { resolve } = await getItemIcons();
    // The raw descriptor source is only a naked numeral, not a rendered map.
    // With no signed clean T14 image, the UI must receive a miss and show its
    // neutral map glyph instead of Blight or legacy Standard art.
    expect(resolve('Map (Tier 14)')).toBeUndefined();
    expect(resolve('Map (Tier 14)')).not.toBe(BLIGHT14_URL);
    expect(resolve('Map (Tier 14)')).not.toBe(LEGACY14_URL);
  });

  it('maps: plain tiers accept signed clean/Allflame art and reject identity overlays', async () => {
    const { resolve } = await getItemIcons();
    expect(resolve('Map (Tier 1)')).toBe(PLAIN1_URL);
    expect(resolve('Map (Tier 16)')).toBe(ALLFLAME16_URL);
    expect(resolve('Map (Tier 16)')).not.toBe(PLAIN16_URL);
    expect(resolve('Map (Tier 16)')).not.toBe(BARAN16_URL);
    // Live T15/T9 currently carry `me:true`; both intentionally miss so the
    // Dashboard uses its neutral map glyph.
    expect(resolve('Map (Tier 9)')).toBeUndefined();
    expect(resolve('Map (Tier 9)')).not.toBe(EVENT9_URL);
    expect(resolve('Map (Tier 15)')).toBeUndefined();
    expect(resolve('Map (Tier 15)')).not.toBe(EVENT15_URL);
  });

  it('maps: untraded Blighted tiers never fall back to normal map art', async () => {
    const { resolve } = await getItemIcons();
    expect(resolve('Blighted Map (Tier 14)')).toBe(BLIGHT14_URL);
    expect(resolve('Blighted Map (Tier 13)')).toBeUndefined();
    expect(resolve('Blighted Map (Tier 13)')).not.toBe(PLAIN16_URL);
  });

  it('maps: the generic map fallback is deliberate highest-tier art, never Vaal Temple roulette', async () => {
    const { resolve } = await getItemIcons();
    // "Shaper Guardian Map" has no tiered key at all -> GENERIC.map, which is
    // now seeded from the highest indexed tier, not the API's first "...Map".
    const url = resolve('Shaper Guardian Map');
    expect(url).toBe(ALLFLAME16_URL);
    expect(url).not.toBe(VAALTEMPLE_URL);
    // The Vaal Temple art still serves its own exact name, of course.
    expect(resolve('Al-Hezmin Vaal Temple Map')).toBe(VAALTEMPLE_URL);
  });
});

describe('WP6.2 item-name helpers', () => {
  it('chiselItemName maps store values to real item names', () => {
    expect(chiselItemName('Cartographer')).toBe("Cartographer's Chisel");
    expect(chiselItemName('Avarice')).toBe("Maven's Chisel of Avarice");
    expect(chiselItemName('Scarabs')).toBe("Maven's Chisel of Scarabs");
    expect(chiselItemName('')).toBeNull();
    expect(chiselItemName(null)).toBeNull();
  });

  it('deliOrbItemName handles possessive and plain orb names', () => {
    expect(deliOrbItemName('Diviner')).toBe("Diviner's Delirium Orb");
    expect(deliOrbItemName('Fine')).toBe('Fine Delirium Orb');
    expect(deliOrbItemName('Abyssal')).toBe('Abyssal Delirium Orb');
    expect(deliOrbItemName("Diviner's")).toBe("Diviner's Delirium Orb");
    expect(deliOrbItemName("Diviner's Delirium Orb")).toBe("Diviner's Delirium Orb");
    expect(deliOrbItemName(null)).toBeNull();
  });
});

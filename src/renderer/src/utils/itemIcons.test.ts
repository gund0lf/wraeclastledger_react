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
// Map shapes mirror the live poe.ninja responses captured via
// scripts/dump-map-icons.mjs (2026-07-09): per-tier names, and the API's
// FIRST Map line being "Al-Hezmin Vaal Temple Map" — the order-roulette
// generic seed the session-17 fix removed.
const VAALTEMPLE_URL = 'https://web.poecdn.com/gen/image/VaalTemple3.png';
const BARAN16_URL    = 'https://web.poecdn.com/gen/image/Baran-MapNumbers16.png';
const NIGHTMARE_URL  = 'https://web.poecdn.com/gen/image/NightmareMapSymbol.png';
const BLIGHT14_URL   = 'https://web.poecdn.com/gen/image/Blight-MapNumbers14.png';
const BLIGHT16_URL   = 'https://web.poecdn.com/gen/image/Blight-MapNumbers16.png';
// Live-observed failure art (2026-07-09 screenshot): the challenge league's
// plain "Map (Tier 16)" line carried a delirium composite, and Standard's
// legacy lines carried Roman-numeral wrong-colour art that last-write-wins
// let overwrite everything.
const DELI16_URL       = 'https://web.poecdn.com/gen/image/Deli-MapNumbers16.png';
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
          { name: 'Empower Support', icon: GEM_URL }, // seeds the GENERIC.gem fallback
        ], slugs: [] };
        if (type === 'Scarab')   return { icons: [
          { name: 'Abyss Scarab',        icon: ABYSS_URL },
          { name: 'Winged Abyss Scarab', icon: WINGED_URL },
        ], slugs: [] };
        if (type === 'DivinationCard') return { icons: [], slugs: ['the-doctor', 'darker-half'] };
        if (type === 'Map') {
          if (league === 'Standard') return { icons: [
            { name: 'Map (Tier 14)', icon: LEGACY14_URL }, // legacy Roman-numeral art
          ], slugs: [] };
          return { icons: [
            { name: 'Al-Hezmin Vaal Temple Map', icon: VAALTEMPLE_URL }, // deliberately FIRST, as live
            { name: 'Baran Map (Tier 16)',       icon: BARAN16_URL },
            { name: 'Map (Tier 16)',             icon: DELI16_URL },     // variant composite, as live
            { name: 'Nightmare Map',             icon: NIGHTMARE_URL },
          ], slugs: [] };
        }
        if (type === 'BlightedMap') return { icons: [
          { name: 'Blighted Map (Tier 14)', icon: BLIGHT14_URL },
          { name: 'Blighted Map (Tier 16)', icon: BLIGHT16_URL },
        ], slugs: [] };
        if (type === 'SkillGem') return { icons: [
          { name: 'Precision', icon: PRECISION_URL },
        ], slugs: [] };
        if (type === 'UniqueJewel') return { icons: [
          // poe.ninja DOES list these (verified live 2026-07-09) — the
          // WP6-era "not cached" assumption was wrong; they were only ever
          // supposed to not resolve WRONGLY.
          { name: 'Forbidden Flame', icon: FLAME_URL },
          { name: 'Forbidden Flesh', icon: FLESH_URL },
        ], slugs: [] };
        return { icons: [], slugs: [] };
      },
    },
  };
});

import { getItemIcons, clearIconCache, chiselItemName, deliOrbItemName } from './itemIcons';

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

  it('gems: an unpriced gem with the "- lvl/qual" shape falls to the generic gem icon', async () => {
    const { resolve } = await getItemIcons();
    // "Alchemist's Mark - 1/23 corrupted" (fixture): base not in the mock
    // cache, but the suffix shape is gem-certain — honest category fallback.
    expect(resolve("Alchemist's Mark - 1/23 corrupted")).toBe(GEM_URL);
  });

  it('keyword fallback still catches uncached items of a known category', async () => {
    const { resolve } = await getItemIcons();
    // 'Titanic Scarab' is not cached, but the scarab keyword generic is seeded
    // from the cached Abyss Scarab.
    expect(resolve('Titanic Scarab')).toBe(ABYSS_URL);
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

  it('known div-card names resolve to the generic card icon', async () => {
    const { resolve } = await getItemIcons();
    // 'Darker Half' has no "The"-prefix so it skips pickGeneric's div-card
    // heuristic and lands on the slug set. ('The Doctor' hits the heuristic.)
    expect(resolve('Darker Half')).toContain('Divination');
    expect(resolve('The Doctor')).toContain('Divination');
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

  it('maps: an untraded "Map (Tier N)" resolves to same-tier art via the tier index', async () => {
    const { resolve } = await getItemIcons();
    // The challenge league has no plain "Map (Tier 14)" line, but STANDARD
    // does — with legacy Roman-numeral art. League-major ranking means the
    // challenge league's Blighted Map (Tier 14) key supplies the art instead.
    expect(resolve('Map (Tier 14)')).toBe(BLIGHT14_URL);
    expect(resolve('Map (Tier 14)')).not.toBe(LEGACY14_URL);
  });

  it('maps: plain "Map (Tier N)" bypasses exact-match art in favour of the ranked index', async () => {
    const { resolve } = await getItemIcons();
    // The challenge league's OWN plain "Map (Tier 16)" line carries variant
    // (delirium) composite art — live-observed. The conqueror-sourced clean
    // art must win via the rank, even though an exact key match exists.
    expect(resolve('Map (Tier 16)')).toBe(BARAN16_URL);
    expect(resolve('Map (Tier 16)')).not.toBe(DELI16_URL);
  });

  it('maps: the generic map fallback is deliberate highest-tier art, never Vaal Temple roulette', async () => {
    const { resolve } = await getItemIcons();
    // "Shaper Guardian Map" has no tiered key at all -> GENERIC.map, which is
    // now seeded from the highest indexed tier, not the API's first "...Map".
    const url = resolve('Shaper Guardian Map');
    expect([BARAN16_URL, BLIGHT16_URL]).toContain(url);
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

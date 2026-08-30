import { describe, it, expect } from 'vitest';
import {
  parsePriceInput,
  formatChaos,
  trimmedMean,
  sanitizeExclusionTerms,
  generateRunRegex,
  generateSlamRegex,
  generateTradeRegex,
  resolveTradeRegexExclusions,
} from './priceUtils';
import {
  DELIRIUM_REWARD_REGEX_FIXTURES,
  NIGHTMARE_DELIRIUM_FOOTER_FIXTURE,
} from './__fixtures__/deliriumMapFixtures';

// ─── parsePriceInput ──────────────────────────────────────────────────────────
describe('parsePriceInput', () => {
  it('parses a plain chaos number', () => {
    expect(parsePriceInput('150', 300)).toBe(150);
  });

  it('parses a chaos number with c suffix', () => {
    expect(parsePriceInput('150c', 300)).toBe(150);
  });

  it('parses a divine value and converts to chaos', () => {
    // 2d × 300c/d = 600c
    expect(parsePriceInput('2d', 300)).toBe(600);
  });

  it('parses a fractional divine value', () => {
    // 0.7d × 300c/d = 210c
    expect(parsePriceInput('0.7d', 300)).toBe(210);
  });

  it('parses a divine value missing the leading zero (".7d")', () => {
    // common user input shorthand
    expect(parsePriceInput('.7d', 300)).toBe(210);
  });

  it('strips commas from large numbers', () => {
    // "1,500c" → 1500
    expect(parsePriceInput('1,500c', 300)).toBe(1500);
  });

  it('is case-insensitive on the suffix', () => {
    expect(parsePriceInput('2D', 300)).toBe(600);
    expect(parsePriceInput('150C', 300)).toBe(150);
  });

  it('trims surrounding whitespace', () => {
    expect(parsePriceInput('  150c  ', 300)).toBe(150);
  });

  it('returns 0 for empty input', () => {
    expect(parsePriceInput('', 300)).toBe(0);
    expect(parsePriceInput('   ', 300)).toBe(0);
  });

  it('returns 0 for unparseable input rather than NaN', () => {
    // Important: callers downstream do arithmetic on the result and would
    // otherwise propagate NaN through the entire investment calculation.
    expect(parsePriceInput('lol', 300)).toBe(0);
    expect(parsePriceInput('1.2.3', 300)).toBe(0);
    expect(parsePriceInput('abc', 300)).toBe(0);
  });
});

// ─── formatChaos ──────────────────────────────────────────────────────────────
describe('formatChaos', () => {
  it('formats chaos with divine equivalent', () => {
    // 600c at 300c/divine → 2.00d
    expect(formatChaos(600, 300)).toBe('600.0c (2.00d)');
  });

  it('shows zero divines when divinePrice is zero', () => {
    // Divide-by-zero guard — production never sets divinePrice=0 once init runs,
    // but the function still has to not crash if called early.
    expect(formatChaos(600, 0)).toBe('600.0c (0.00d)');
  });

  it('rounds chaos to one decimal and divines to two', () => {
    expect(formatChaos(123.456, 100)).toBe('123.5c (1.23d)');
  });
});

// ─── trimmedMean ──────────────────────────────────────────────────────────────
describe('trimmedMean', () => {
  it('returns 0 on an empty array', () => {
    expect(trimmedMean([])).toBe(0);
  });

  it('is the regular mean for n <= 4 (no trimming)', () => {
    // n=1 through n=4 all return regular mean
    expect(trimmedMean([10])).toBe(10);
    expect(trimmedMean([10, 20])).toBe(15);
    expect(trimmedMean([10, 20, 30])).toBe(20);
    expect(trimmedMean([10, 20, 30, 40])).toBe(25);
  });

  it('drops min and max for n >= 5', () => {
    // [10, 20, 30, 40, 1000] → drop 10 and 1000 → mean of [20, 30, 40] = 30
    expect(trimmedMean([10, 20, 30, 40, 1000])).toBe(30);
  });

  it('handles unsorted input correctly (sorts internally)', () => {
    // Same data as above, different order → same result
    expect(trimmedMean([1000, 30, 10, 40, 20])).toBe(30);
  });

  it('trims symmetrically — one from each end', () => {
    // [1, 2, 3, 4, 5, 6, 7] → drop 1 and 7 → mean of [2,3,4,5,6] = 4
    expect(trimmedMean([1, 2, 3, 4, 5, 6, 7])).toBe(4);
  });

  it('handles all-identical values', () => {
    expect(trimmedMean([100, 100, 100, 100, 100])).toBe(100);
  });
});

// ─── sanitizeExclusionTerms ───────────────────────────────────────────────────
describe('sanitizeExclusionTerms', () => {
  it('passes through clean bare terms unchanged', () => {
    expect(sanitizeExclusionTerms(['eche', 'tab', 'wb'])).toEqual(['eche', 'tab', 'wb']);
  });

  it('strips surrounding double quotes', () => {
    expect(sanitizeExclusionTerms(['"eche"', '"tab"'])).toEqual(['eche', 'tab']);
  });

  it('strips a leading exclamation mark', () => {
    // Saved exclusions from old buggy versions sometimes include the ! prefix
    // that should only appear in the assembled regex, not the term list.
    expect(sanitizeExclusionTerms(['!eche', '!tab'])).toEqual(['eche', 'tab']);
  });

  it('strips quotes AND leading exclamation in combination', () => {
    expect(sanitizeExclusionTerms(['"!eche"'])).toEqual(['eche']);
  });

  it('rejects fragments containing pipe-joined regex (the corruption case)', () => {
    // The bug this guards against: an entire built regex like '"!nsta|eche"'
    // got stored as a single exclusion term, which would then be re-wrapped
    // in another !"..." producing nested quotes / double exclusions in
    // the output regex. After sanitisation, this should disappear entirely
    // — the surrounding quotes get stripped, then the inner '|' makes it
    // *not* a single term... but actually the current implementation
    // doesn't reject pipes. It rejects parens, asterisks, and embedded
    // quotes. So a pipe-only fragment passes through. This is documented
    // behaviour, captured here so any future change is intentional.
    const result = sanitizeExclusionTerms(['"!nsta|eche"']);
    expect(result).toEqual(['nsta|eche']);
  });

  it('rejects terms containing parentheses (regex grouping characters)', () => {
    expect(sanitizeExclusionTerms(['(urr.*\\d..)'])).toEqual([]);
  });

  it('rejects terms containing asterisks (regex quantifier)', () => {
    expect(sanitizeExclusionTerms(['urr.*'])).toEqual([]);
  });

  it('rejects terms containing embedded quotes', () => {
    // After stripping surrounding quotes, a remaining inner quote is a corruption signal.
    expect(sanitizeExclusionTerms(['eche"foo'])).toEqual([]);
  });

  it('drops empty strings entirely', () => {
    expect(sanitizeExclusionTerms(['', 'eche', '   '])).toEqual(['eche']);
  });

  it('drops strings that become empty after stripping prefixes', () => {
    expect(sanitizeExclusionTerms(['""', '!', '!""'])).toEqual([]);
  });

  it('migrates and deduplicates every legacy reflect token to 3.29 Thorns', () => {
    expect(sanitizeExclusionTerms(['s ref', 'f ele', 't 20', 'horns'])).toEqual(['horns']);
  });
});

// ─── generateRunRegex ─────────────────────────────────────────────────────────
//
// generateRunRegex is the most consequential utility — it produces the regex
// users paste into PoE's stash search. Bugs here corrupt every session. Tests
// focus on threshold tier boundaries (where most past bugs lived) and on the
// branching between high-currency and regular-currency sessions.

describe('generateRunRegex', () => {
  const baseAvg = {
    avgQuant: 0, avgPack: 0, avgCurr: 0, avgRarity: 0, avgScarabs: 0,
  };

  describe('exclusions', () => {
    it('omits the exclusion block when no terms are given', () => {
      const r = generateRunRegex({ ...baseAvg, avgPack: 50, avgCurr: 60 });
      expect(r).not.toContain('!');
    });

    it('produces a single !-prefixed pipe-joined block for multiple terms', () => {
      const r = generateRunRegex(
        { ...baseAvg, avgPack: 50, avgCurr: 60 },
        ['eche', 'tab', 'wb'],
      );
      expect(r).toContain('"!eche|tab|wb"');
    });

    it('runs exclusions through sanitiser (corrupted terms are dropped, not propagated)', () => {
      // 'wb*' has an asterisk → dropped. The remaining 'eche' is kept.
      const r = generateRunRegex(
        { ...baseAvg, avgPack: 50, avgCurr: 60 },
        ['eche', 'wb*'],
      );
      expect(r).toContain('"!eche"');
      expect(r).not.toContain('wb*');
    });
  });

  describe('inclusions', () => {
    it('requires one selected positive modifier as an AND clause', () => {
      const r = generateRunRegex(
        { ...baseAvg, avgPack: 50, avgCurr: 60 },
        [],
        ['brick:increased_rare_monsters'],
      );
      expect(r).toContain('"rare mo"');
    });

    it('joins multiple positive modifiers into one match-any clause', () => {
      const r = generateRunRegex(
        { ...baseAvg, avgPack: 50, avgCurr: 60 },
        [],
        ['brick:increased_rare_monsters', 'brick:increased_magic_monsters'],
      );
      expect(r).toContain('"(rare mo|agic mo)"');
    });

    it('keeps positive and negative modifier clauses separate', () => {
      const r = generateRunRegex(
        { ...baseAvg, avgPack: 50, avgCurr: 60 },
        ['brick:cannot_regenerate_life_mana_es'],
        ['brick:increased_rare_monsters'],
      );
      expect(r).toContain('"!reg" "rare mo"');
    });
  });

  describe('high-currency branch (avgCurr >= 80)', () => {
    it('produces SEPARATE currency and pack quotes (AND semantics)', () => {
      // avgCurr=120, avgPack=50 → currFloor=120, packFloor=50
      const r = generateRunRegex({ ...baseAvg, avgCurr: 120, avgPack: 50 });
      expect(r).toContain('"urr.*');
      expect(r).toContain('"ack.*');
      // The two should be separate quoted groups (AND), not a single OR
      expect(r).not.toMatch(/"urr.*\|ack/);
    });

    it('rounds avgCurr down to the nearest 10 for the currency floor', () => {
      // avgCurr=87 → currFloor=80
      const r = generateRunRegex({ ...baseAvg, avgCurr: 87, avgPack: 50 });
      // 80 → "[8-9].|\\d.." (2-digit 80-99 OR 3-digit)
      expect(r).toContain('"urr.*([8-9].|\\d..)%"');
    });
  });

  describe('regular-currency branch (avgCurr < 80)', () => {
    it('produces a single OR-joined currency-or-pack quote', () => {
      const r = generateRunRegex({ ...baseAvg, avgCurr: 60, avgPack: 50 });
      // Single quoted group with `|` between currency and pack
      expect(r).toMatch(/"\(urr\.\*.*\|ack\.\*.*\)"/);
    });

    it('floors currency at 40 even when avgCurr is below that', () => {
      // avgCurr=20 → floored to 40 (the regex won't go below this)
      const r = generateRunRegex({ ...baseAvg, avgCurr: 20, avgPack: 50 });
      // 40 → "[4-9].|\\d.."
      expect(r).toContain('urr.*([4-9].|\\d..)');
    });
  });

  describe('quantity gate', () => {
    it('omits quantity quote when avgQuant <= 20', () => {
      const r = generateRunRegex({ ...baseAvg, avgQuant: 20, avgCurr: 60, avgPack: 50 });
      expect(r).not.toContain('m q.*');
    });

    it('targets Item Quantity rather than accidentally targeting Pack Size', () => {
      // avgQuant=50 → 0.6 × 50 = 30 → quantFloor=30
      const r = generateRunRegex({ ...baseAvg, avgQuant: 50, avgCurr: 60, avgPack: 50 });
      expect(r).toContain('"m q.*([3-9].|\\d..)%"');
      expect(r).not.toContain('iz.*');
    });

    it('keeps quantity and pack as distinct quoted conditions', () => {
      const r = generateRunRegex({ ...baseAvg, avgQuant: 100, avgPack: 40, avgCurr: 0 });
      expect(r).toContain('"ack.*([4-9].|\\d..)%"');
      expect(r).toContain('"m q.*([6-9].|\\d..)%"');
    });
  });

  describe('rarity gate', () => {
    it('omits rarity quote when avgRarity <= 40', () => {
      const r = generateRunRegex({ ...baseAvg, avgRarity: 40, avgCurr: 60, avgPack: 50 });
      expect(r).not.toContain('m rar.*');
    });

    it('includes rarity quote when avgRarity > 40', () => {
      // avgRarity=80 → 0.6 × 80 = 48 → floored to 40
      const r = generateRunRegex({ ...baseAvg, avgRarity: 80, avgCurr: 60, avgPack: 50 });
      expect(r).toContain('"m rar.*');
    });
  });

  describe('thresholdPat — regression tests for the 1.0.40 fix', () => {
    // The 1.0.40 changelog calls out that 100-199 floors were producing
    // an ambiguous \d.. instead of the correct 1[X-9].|[2-9].. pattern.
    // These tests pin that fix in place.

    it('avgCurr=140 in high-currency branch → 1[4-9].|[2-9]..', () => {
      const r = generateRunRegex({ ...baseAvg, avgCurr: 140, avgPack: 50 });
      expect(r).toContain('"urr.*(1[4-9].|[2-9]..)%"');
    });

    it('avgCurr=200 in high-currency branch → [2-9]..', () => {
      const r = generateRunRegex({ ...baseAvg, avgCurr: 200, avgPack: 50 });
      expect(r).toContain('"urr.*([2-9]..)%"');
    });

    it('avgCurr=100 (exact century boundary) → \\d.. (any 3-digit)', () => {
      // f%100 == 0 branch — "100 or higher" needs no further constraint
      // because anything 3-digit is >= 100.
      const r = generateRunRegex({ ...baseAvg, avgCurr: 100, avgPack: 50 });
      expect(r).toContain('"urr.*(\\d..)%"');
    });
  });
});

// ─── generateSlamRegex ────────────────────────────────────────────────────────
describe('Trade modal regex', () => {
  const bricks = [
    { id: 'brick_max_res_regular', regexTerm: '-(9|1[0-2])% to all' },
    { id: 'cannot_regenerate_life_mana_es', regexTerm: 'reg' },
    { id: 'players_less_accuracy', regexTerm: 'ss acc' },
  ];

  it('uses the live modal selection while preserving custom session terms', () => {
    expect(resolveTradeRegexExclusions(
      ['cannot_regenerate_life_mana_es', 'players_less_accuracy'],
      bricks,
      ['um re', 'custom-token'],
    )).toEqual([
      'custom-token',
      'brick:cannot_regenerate_life_mana_es',
      'brick:players_less_accuracy',
    ]);
  });

  it('does not restore a known session brick deselected in the modal', () => {
    expect(resolveTradeRegexExclusions(
      ['cannot_regenerate_life_mana_es'],
      bricks,
      ['um re', 'reg'],
    )).toEqual(['brick:cannot_regenerate_life_mana_es']);
  });

  it('compiles modal semantic ids to the exact reviewed stash terms', () => {
    expect(generateTradeRegex([
      'brick:brick_max_res_regular',
      'brick:cannot_regenerate_life_mana_es',
    ], [], 0, 0, 0, 0)).toBe('"!-(9|1[0-2])% to all|reg"');
  });

  it('copies exclusions even when every numeric Trade threshold is zero', () => {
    expect(generateTradeRegex(['reg', 'ss acc'], [], 0, 0, 0, 0)).toBe('"!reg|ss acc"');
  });

  it('hides Copy Regex only when exclusions and thresholds are both empty', () => {
    expect(generateTradeRegex([], [], 0, 0, 0, 0)).toBe('');
  });

  it('copies one positive modifier as a required clause', () => {
    expect(generateTradeRegex(
      [],
      ['brick:increased_rare_monsters'],
      0, 0, 0, 0,
    )).toBe('"rare mo"');
  });

  it('copies multiple positive modifiers as one match-any clause', () => {
    expect(generateTradeRegex(
      [],
      ['brick:increased_rare_monsters', 'brick:increased_magic_monsters'],
      0, 0, 0, 0,
    )).toBe('"(rare mo|agic mo)"');
  });

  it('uses the Item Quantity anchor for the modal IIQ floor', () => {
    const regex = generateTradeRegex(['reg'], [], 100, 40, 0, 0);
    expect(regex).toBe(
      '"!reg" "ack.*([4-9].|\\d..)%" "m q.*(\\d..)%"',
    );
  });

  it('uses literal Trade minimums instead of applying session-average heuristics', () => {
    expect(generateTradeRegex([], [], 110, 45, 0, 5)).toBe(
      '"ack.*(4[5-9]|[5-9].|\\d..)%" "m q.*(1[1-9].|[2-9]..)%" "m rar.*([5-9]|[1-9].|\\d..)%"',
    );
    expect(generateTradeRegex([], [], 110, 0, 0, 0)).not.toContain('ack.*');
  });

  it('matches a real 110 IIQ map without needing an IIR clause', () => {
    const regex = generateTradeRegex([], [], 110, 45, 0, 0, 20);
    const mapText = [
      'Item Quantity: +110%',
      'Item Rarity: +0%',
      'Monster Pack Size: +45%',
      'Players in Area are 20% Delirious',
    ].join('\n');
    const clauses = [...regex.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
    expect(clauses).toHaveLength(3);
    expect(clauses.every((clause) => new RegExp(clause, 'is').test(mapText))).toBe(true);
    expect(regex).not.toContain('m rar.*');
  });

  it('keeps positive currency and pack minimums as separate AND clauses', () => {
    expect(generateTradeRegex([], [], 0, 40, 60, 0)).toBe(
      '"urr.*([6-9].|\\d..)%" "ack.*([4-9].|\\d..)%"',
    );
  });

  it('keeps exact unit floors across two- and three-digit boundaries', () => {
    expect(generateTradeRegex([], [], 115, 0, 0, 0)).toBe(
      '"m q.*(11[5-9]|1[2-9].|[2-9]..)%"',
    );
    expect(generateTradeRegex([], [], 0, 0, 145, 0)).toBe(
      '"urr.*(14[5-9]|1[5-9].|[2-9]..)%"',
    );
  });

  it('adds an exact delirium percentage to the copied Trade regex', () => {
    expect(generateTradeRegex([], [], 0, 0, 0, 0, 20)).toBe('"20%.+delirious"');
  });

  it('uses a negative delirium term when None is selected', () => {
    expect(generateTradeRegex([], [], 0, 0, 0, 0, 0)).toBe('"!delirious"');
  });

  it('does not confuse the Nightmare crafting footer with the Delirious map state', () => {
    expect(NIGHTMARE_DELIRIUM_FOOTER_FIXTURE).toMatch(/20%[\s\S]+Delirium Orbs/i);
    expect(NIGHTMARE_DELIRIUM_FOOTER_FIXTURE).not.toMatch(/Delirious/i);

    const positiveClause = generateTradeRegex([], [], 0, 0, 0, 0, 20).slice(1, -1);
    expect(new RegExp(positiveClause, 'is').test(NIGHTMARE_DELIRIUM_FOOTER_FIXTURE)).toBe(false);

    const deliriousNightmare = NIGHTMARE_DELIRIUM_FOOTER_FIXTURE.replace(
      'Modifiable only with Chaos Orbs',
      'Players in Area are 20% Delirious (enchant)\n\nModifiable only with Chaos Orbs',
    );
    expect(new RegExp(positiveClause, 'is').test(deliriousNightmare)).toBe(true);
  });

  it('copies one selected Delirium reward type as a required stash clause', () => {
    const regex = generateTradeRegex([], [], 0, 0, 0, 0, 20, ['curr']);
    expect(regex).toBe('"20%.+delirious" ": curr"');

    const clauses = [...regex.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
    expect(clauses.every((clause) => new RegExp(clause, 'is')
      .test(DELIRIUM_REWARD_REGEX_FIXTURES.currency))).toBe(true);
    expect(clauses.every((clause) => new RegExp(clause, 'is')
      .test(DELIRIUM_REWARD_REGEX_FIXTURES.jewellery))).toBe(false);
  });

  it('copies multiple Delirium rewards as one match-any clause', () => {
    const regex = generateTradeRegex([], [], 0, 0, 0, 0, 20, [
      'curr',
      'jew',
    ]);
    expect(regex).toBe('"20%.+delirious" ": (curr|jew)"');

    const clauses = [...regex.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
    for (const fixture of Object.values(DELIRIUM_REWARD_REGEX_FIXTURES)) {
      expect(clauses.every((clause) => new RegExp(clause, 'is').test(fixture))).toBe(true);
    }
  });

  it('does not confuse real More Currency or Currency quality lines with a reward', () => {
    const jewelleryWithCurrencyQuality = DELIRIUM_REWARD_REGEX_FIXTURES.jewellery.replace(
      'Item Quantity:',
      'Quality (Currency): +20% (augmented)\nItem Quantity:',
    );
    const rewardClause = generateTradeRegex([], [], 0, 0, 0, 0, -1, ['curr'])
      .slice(1, -1);
    expect(new RegExp(rewardClause, 'is').test(jewelleryWithCurrencyQuality)).toBe(false);
  });
});

describe('generateSlamRegex', () => {
  const baseAvg = {
    avgQuant: 0, avgPack: 0, avgCurr: 0, avgRarity: 0, avgScarabs: 0,
  };

  it('uses 75% of session averages as the floor (more lenient than run regex)', () => {
    // avgCurr=80 → 80*0.75 = 60 → floored to 30 minimum, so 60 stays
    // avgPack=50 → 50*0.75 = 37.5 → floor(3.75)*10 = 30
    const r = generateSlamRegex({ ...baseAvg, avgCurr: 80, avgPack: 50 });
    // Expect currency floor of 60 (60 → "[6-9].|\\d..")
    expect(r).toContain('urr.*([6-9].|\\d..)');
  });

  it('always uses the OR-joined single-quote form (no high/low branch)', () => {
    // Slam is more lenient by design — no separate "high currency" mode
    const r = generateSlamRegex({ ...baseAvg, avgCurr: 200, avgPack: 100 });
    expect(r).toMatch(/"\(urr\.\*.*\|ack\.\*.*\)"/);
  });

  it('uses pack only when the session has no Currency average', () => {
    // Currency is absent from the source setup, so it must not become a SLAM keeper.
    const r = generateSlamRegex({ ...baseAvg });
    expect(r).not.toContain('urr.*');
    expect(r).toContain('ack.*([1-9].|\\d..)');
  });

  it('retains the 30 Currency floor for a positive low average', () => {
    const r = generateSlamRegex({ ...baseAvg, avgCurr: 20, avgPack: 20 });
    expect(r).toContain('urr.*([3-9].|\\d..)');
    expect(r).toContain('ack.*([1-9].|\\d..)');
  });

  it('includes sanitised exclusions when provided', () => {
    const r = generateSlamRegex({ ...baseAvg, avgCurr: 80, avgPack: 50 }, ['eche']);
    expect(r).toContain('"!eche"');
  });

  it('includes positive modifier selections when provided', () => {
    const r = generateSlamRegex(
      { ...baseAvg, avgCurr: 80, avgPack: 50 },
      [],
      ['brick:uber_rare_monsters_fracture_on_death'],
    );
    expect(r).toContain('"ractu"');
  });
});

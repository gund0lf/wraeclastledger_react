import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../store/useSessionStore';
import type { SessionSettings } from '../types';
import { investmentCompleteness } from './investmentCompleteness';

const settings = (patch: Partial<SessionSettings> = {}): SessionSettings => ({
  ...DEFAULT_SETTINGS,
  scarabs: DEFAULT_SETTINGS.scarabs.map((scarab) => ({ ...scarab })),
  ...patch,
});

describe('investmentCompleteness', () => {
  it('keeps an untouched session empty and share-safe', () => {
    const result = investmentCompleteness(settings());
    expect(Object.values(result.sections).every((value) => value === 'empty')).toBe(true);
    expect(result.incompleteCostLabels).toEqual([]);
    expect(result.hasIncompleteCosts).toBe(false);
  });

  it('marks imported setup identities without current prices incomplete', () => {
    const result = investmentCompleteness(settings({
      chiselType: 'Avarice',
      chiselUsed: true,
      advDeliOrbType: 'Skittering Delirium Orb',
      advDeliOrbQtyPerMap: 3,
      advAstrolabeType: 'Templar Astrolabe',
      scarabs: [
        { name: 'Horned Scarab of Awakening', cost: 0 },
        ...DEFAULT_SETTINGS.scarabs.slice(1).map((scarab) => ({ ...scarab })),
      ],
    }));

    expect(result.sections.chisel).toBe('incomplete');
    expect(result.sections.delirium).toBe('incomplete');
    expect(result.sections.astrolabe).toBe('incomplete');
    expect(result.incompleteCostLabels).toEqual([
      'Chisel', 'Delirium Orbs', 'Astrolabe', 'Scarab 1',
    ]);
  });

  it('requires rolling quantity and total paid together', () => {
    expect(investmentCompleteness(settings({ advExalt: 10 })).sections.rolling).toBe('incomplete');
    expect(investmentCompleteness(settings({ advExaltPrice: 50 })).sections.rolling).toBe('incomplete');
    expect(investmentCompleteness(settings({ advExalt: 10, advExaltPrice: 50 })).sections.rolling).toBe('filled');
    expect(investmentCompleteness(settings({ advChaos: 20 })).sections.rolling).toBe('filled');
  });

  it('marks fully priced configured costs filled', () => {
    const result = investmentCompleteness(settings({
      baseMapCost: 20,
      chiselType: 'Avarice',
      chiselUsed: true,
      chiselPrice: 6,
      advDeliOrbType: 'Skittering Delirium Orb',
      advDeliOrbQtyPerMap: 3,
      advDeliOrbPriceEach: 8,
      advAstrolabeType: 'Templar Astrolabe',
      advAstrolabePrice: 90,
      advAstrolabeCount: 4,
      scarabs: [
        { name: 'Horned Scarab of Awakening', cost: 11 },
        ...DEFAULT_SETTINGS.scarabs.slice(1).map((scarab) => ({ ...scarab })),
      ],
    }));

    expect(result.sections.baseMap).toBe('filled');
    expect(result.sections.chisel).toBe('filled');
    expect(result.sections.delirium).toBe('filled');
    expect(result.sections.astrolabe).toBe('filled');
    expect(result.hasIncompleteCosts).toBe(false);
  });

  it('keeps gem completeness visible without blocking map-profit sharing', () => {
    const result = investmentCompleteness(settings({ advGemName: 'Empower' }));
    expect(result.sections.gem).toBe('incomplete');
    expect(result.hasIncompleteCosts).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildImportedSetupPlan,
  nextAstrolabeSelection,
  nextChiselSelection,
  nextDeliriumSelection,
  nextScarabSelection,
  normalizeImportedChiselType,
} from './investmentSetup';

describe('investment setup cloning', () => {
  it('keeps reusable setup identity and omits authored economics', () => {
    expect(buildImportedSetupPlan({
      mapType: '8-mod',
      chisel: 'Avarice',
      scarabs: ['Horned Scarab of Awakening', 'Trarthan Scarab of Infamy'],
      deliriumType: 'Skittering Delirium Orb',
      deliriumCountPerMap: 3,
      astrolabeType: 'Templar Astrolabe',
    })).toEqual({
      mapType: '8-mod',
      chiselType: 'Avarice',
      scarabNames: ['Horned Scarab of Awakening', 'Trarthan Scarab of Infamy'],
      deliriumType: 'Skittering Delirium Orb',
      deliriumCountPerMap: 3,
      astrolabeType: 'Templar Astrolabe',
    });
  });

  it('normalizes historical full chisel item names', () => {
    expect(normalizeImportedChiselType("Maven's Chisel of Avarice")).toBe('Avarice');
    expect(normalizeImportedChiselType("Cartographer's Chisel")).toBe('Cartographer');
    expect(normalizeImportedChiselType('None')).toBe('');
  });

  it('clears stale prices when item identity changes', () => {
    expect(nextChiselSelection({ chiselType: 'Avarice', chiselUsed: true, chiselPrice: 6 }, 'Divination'))
      .toEqual({ chiselType: 'Divination', chiselUsed: true, chiselPrice: 0 });
    expect(nextDeliriumSelection({
      advDeliOrbType: 'Skittering Delirium Orb',
      advDeliOrbQtyPerMap: 3,
      advDeliOrbPriceEach: 8,
    }, 'Fine Delirium Orb')).toEqual({
      advDeliOrbType: 'Fine Delirium Orb',
      advDeliOrbQtyPerMap: 3,
      advDeliOrbPriceEach: 0,
    });
    expect(nextAstrolabeSelection({
      advAstrolabeType: 'Templar Astrolabe', advAstrolabePrice: 90, advAstrolabeCount: 4,
    }, 'Ritualist Astrolabe')).toEqual({
      advAstrolabeType: 'Ritualist Astrolabe', advAstrolabePrice: 0, advAstrolabeCount: 0,
    });
    expect(nextScarabSelection({ name: 'Old Scarab', cost: 12 }, 'New Scarab'))
      .toEqual({ name: 'New Scarab', cost: 0 });
  });

  it('clears every dependent value when None is selected', () => {
    expect(nextChiselSelection({ chiselType: 'Avarice', chiselUsed: true, chiselPrice: 6 }, ''))
      .toEqual({ chiselType: '', chiselUsed: false, chiselPrice: 0 });
    expect(nextDeliriumSelection({
      advDeliOrbType: 'Skittering Delirium Orb', advDeliOrbQtyPerMap: 3, advDeliOrbPriceEach: 8,
    }, '')).toEqual({ advDeliOrbType: '', advDeliOrbQtyPerMap: 0, advDeliOrbPriceEach: 0 });
    expect(nextAstrolabeSelection({
      advAstrolabeType: 'Templar Astrolabe', advAstrolabePrice: 90, advAstrolabeCount: 4,
    }, '')).toEqual({ advAstrolabeType: '', advAstrolabePrice: 0, advAstrolabeCount: 0 });
  });
});

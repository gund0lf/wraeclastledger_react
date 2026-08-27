import { describe, expect, it } from 'vitest';
import {
  formatRegexAverageSummary,
  isSlamUnavailableForSession,
} from './regexSessionPresentation';

describe('Regex session summary presentation', () => {
  it('omits Currency when its trimmed average is zero', () => {
    expect(formatRegexAverageSummary({
      avgQuant: 106.4,
      avgRarity: 63.3,
      avgPack: 40.8,
      avgCurr: 0,
    })).toBe('106%Q · 63%R · 41%P');
  });

  it('retains a positive Currency average', () => {
    expect(formatRegexAverageSummary({
      avgQuant: 114.2,
      avgRarity: 67.3,
      avgPack: 43.4,
      avgCurr: 64.2,
    })).toBe('114%Q · 67%R · 43%P · 64% Curr');
  });
});

describe('Regex SLAM availability', () => {
  it('rejects an entirely corrupted session without guessing from mod counts', () => {
    expect(isSlamUnavailableForSession([
      { isCorrupted: true, isNightmare: false },
      { isCorrupted: true, isNightmare: false },
    ])).toBe(true);
  });

  it('rejects Nightmare maps and allows a session containing a slam-capable map', () => {
    expect(isSlamUnavailableForSession([
      { isCorrupted: false, isNightmare: true },
    ])).toBe(true);
    expect(isSlamUnavailableForSession([
      { isCorrupted: true, isNightmare: false },
      { isCorrupted: false, isNightmare: false },
    ])).toBe(false);
    expect(isSlamUnavailableForSession([])).toBe(false);
  });
});

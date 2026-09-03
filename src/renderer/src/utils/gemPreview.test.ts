import { describe, expect, it } from 'vitest';
import { buildGemPreviewIndex } from './gemPreview';

describe('gem preview prefix index', () => {
  const gems = new Map([
    ['empower support', 'empower.png'],
    ['enhance support', 'enhance.png'],
    ['enlighten support', 'enlighten.png'],
    ['nightblade support', 'nightblade.png'],
    ['fireball', 'fireball.png'],
    ['fireball of pelting', 'pelting.png'],
  ]);

  it('changes from neutral to the uniquely identified gem as typing narrows the candidates', () => {
    const index = buildGemPreviewIndex(gems);
    expect(['', 'e', 'en', 'enh', 'enhance', 'enhance support'].map((text) => index.get(text)))
      .toEqual([undefined, undefined, undefined, 'enhance.png', 'enhance.png', 'enhance.png']);
    expect(index.get('emp')).toBe('empower.png');
    expect(index.get('enl')).toBe('enlighten.png');
    expect(index.get('nightb')).toBe('nightblade.png');
  });

  it('prefers an exact base name over its longer variants', () => {
    const index = buildGemPreviewIndex(gems);
    expect(index.get('fire')).toBeUndefined();
    expect(index.get('fireball')).toBe('fireball.png');
    expect(index.get('fireball of')).toBe('pelting.png');
  });

  it('does not mistake shared artwork for an unambiguous name', () => {
    const index = buildGemPreviewIndex(new Map([
      ['fireball of pelting', 'shared.png'], ['fireball of flames', 'shared.png'],
    ]));
    expect(index.get('fireball')).toBeUndefined();
    expect(index.get('fireball of p')).toBe('shared.png');
  });

  it('is independent of catalogue ordering', () => {
    const normal = buildGemPreviewIndex(gems);
    const reversed = buildGemPreviewIndex(new Map([...gems].reverse()));
    expect(normal).toEqual(reversed);
  });

  it('does not guess substrings, misspellings, suffixed names or keyword fallbacks', () => {
    const index = buildGemPreviewIndex(gems);
    for (const text of ['power', 'support', 'empwoer', 'unknown support', 'empower support plus']) {
      expect(index.get(text)).toBeUndefined();
    }
  });

  it('ignores empty entries and retains no entries when the cache is empty', () => {
    expect(buildGemPreviewIndex(new Map())).toEqual(new Map());
    expect(buildGemPreviewIndex(new Map([['', 'bad.png'], ['missing support', '']])))
      .toEqual(new Map());
  });
});

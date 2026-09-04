import { describe, expect, it } from 'vitest';
import { isStrategyBackIntent } from './strategyBackNavigation';

describe('isStrategyBackIntent', () => {
  it('accepts the ordinary mouse Back button', () => {
    expect(isStrategyBackIntent({
      kind: 'mouse',
      button: 3,
      defaultPrevented: false,
    })).toBe(true);
  });

  it('does not claim other mouse buttons or an already handled event', () => {
    expect(isStrategyBackIntent({
      kind: 'mouse',
      button: 4,
      defaultPrevented: false,
    })).toBe(false);
    expect(isStrategyBackIntent({
      kind: 'mouse',
      button: 3,
      defaultPrevented: true,
    })).toBe(false);
  });

  it('accepts Escape and unmodified Alt+Left outside editable controls', () => {
    const base = {
      kind: 'keyboard' as const,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      targetEditable: false,
      defaultPrevented: false,
    };

    expect(isStrategyBackIntent({ ...base, key: 'Escape' })).toBe(true);
    expect(isStrategyBackIntent({ ...base, key: 'ArrowLeft', altKey: true })).toBe(true);
  });

  it('preserves text editing, modified shortcuts and handled keyboard events', () => {
    const base = {
      kind: 'keyboard' as const,
      key: 'Escape',
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      targetEditable: false,
      defaultPrevented: false,
    };

    expect(isStrategyBackIntent({ ...base, targetEditable: true })).toBe(false);
    expect(isStrategyBackIntent({ ...base, defaultPrevented: true })).toBe(false);
    expect(isStrategyBackIntent({ ...base, key: 'ArrowLeft', altKey: true, ctrlKey: true })).toBe(false);
    expect(isStrategyBackIntent({ ...base, key: 'ArrowLeft', altKey: true, metaKey: true })).toBe(false);
    expect(isStrategyBackIntent({ ...base, key: 'ArrowLeft' })).toBe(false);
  });
});

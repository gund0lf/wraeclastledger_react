/**
 * pickKeys — the pure slice-picker under useSessionKeys (session 17
 * typing-lag fix). The hook itself needs a React renderer to test; the
 * picking + shallow-equality contract it relies on is testable here.
 */
import { describe, it, expect } from 'vitest';
import { pickKeys } from './useSessionStore';

describe('pickKeys', () => {
  const state = { a: 1, b: 'x', c: [1, 2], d: () => 42 };

  it('picks exactly the requested keys', () => {
    const out = pickKeys(state, ['a', 'c']);
    expect(out).toEqual({ a: 1, c: [1, 2] });
    expect(Object.keys(out)).toEqual(['a', 'c']);
  });

  it('copies values by reference (shallow), not by clone', () => {
    const out = pickKeys(state, ['c', 'd']);
    expect(out.c).toBe(state.c);
    expect(out.d).toBe(state.d);
  });

  it('two picks over unchanged state are shallow-equal key-by-key (what useShallow compares)', () => {
    const p1 = pickKeys(state, ['a', 'b', 'c', 'd']);
    const p2 = pickKeys(state, ['a', 'b', 'c', 'd']);
    for (const k of Object.keys(p1) as (keyof typeof p1)[]) {
      expect(p1[k]).toBe(p2[k]);
    }
  });

  it('a pick over a changed unrelated key still matches on the picked keys', () => {
    // Simulates a store set() that only touched sessionNotes: subscribers
    // picking other keys must see identical references and skip the re-render.
    const next = { ...state, b: 'changed' };
    const p1 = pickKeys(state, ['a', 'c', 'd']);
    const p2 = pickKeys(next, ['a', 'c', 'd']);
    for (const k of Object.keys(p1) as (keyof typeof p1)[]) {
      expect(p1[k]).toBe(p2[k]);
    }
  });

  it('a pick that includes the changed key differs on exactly that key', () => {
    const next = { ...state, b: 'changed' };
    const p1 = pickKeys(state, ['a', 'b']);
    const p2 = pickKeys(next, ['a', 'b']);
    expect(p1.a).toBe(p2.a);
    expect(p1.b).not.toBe(p2.b);
  });
});

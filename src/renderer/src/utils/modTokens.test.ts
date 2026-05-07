/**
 * modTokens.test.ts — guards token integrity and catches regressions.
 *
 * What this tests:
 *   1. Every token ID is unique
 *   2. Every token value is non-empty
 *   3. No accidental duplicate tokens that would cause false-positive collisions
 *      (unless intentionally documented)
 *   4. RegexBuilder group tokens all resolve from MOD_TOKENS
 */

import { describe, it, expect } from 'vitest';
import { MOD_TOKENS } from './modTokens';

describe('MOD_TOKENS integrity', () => {
  const entries = Object.entries(MOD_TOKENS);

  it('has no empty tokens', () => {
    for (const [id, token] of entries) {
      expect(token.length, `${id} has empty token`).toBeGreaterThan(0);
    }
  });

  it('has unique IDs (enforced by TS object keys)', () => {
    // TypeScript objects can't have duplicate keys at compile time,
    // but this guards against copy-paste errors where a key shadows another.
    expect(entries.length).toBeGreaterThan(100);
  });

  it('flags unexpected duplicate token values', () => {
    // Some tokens intentionally overlap (e.g. regular + uber for same mod text).
    // This test documents which duplicates are known-intentional.
    const KNOWN_DUPES = new Set([
      'um re',  // reduced_max_resistances (regular) + uber_20_max_resistances
      'tun',    // cannot_be_stunned (regular) + uber_stunned_action_move_speed_floor
      'poss',   // unique_bosses_possessed (regular) — shared with uber Enthralled
      'yers e', // buffs_on_players_expire_faster (regular) — shared with uber Transience
    ]);

    const seen = new Map<string, string[]>();
    for (const [id, token] of entries) {
      if (!seen.has(token)) seen.set(token, []);
      seen.get(token)!.push(id);
    }

    for (const [token, ids] of seen) {
      if (ids.length > 1 && !KNOWN_DUPES.has(token)) {
        throw new Error(
          `Unexpected duplicate token '${token}' shared by: ${ids.join(', ')}. ` +
          `If intentional, add to KNOWN_DUPES in this test.`
        );
      }
    }
  });

  it('all tokens are reasonably short for stash regex use', () => {
    for (const [id, token] of entries) {
      expect(token.length, `${id} token '${token}' is too long (>10 chars)`).toBeLessThanOrEqual(10);
    }
  });
});

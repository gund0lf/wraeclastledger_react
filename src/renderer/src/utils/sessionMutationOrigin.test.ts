import { describe, expect, it } from 'vitest';
import {
  isAutomaticSessionMutation,
  withAutomaticSessionMutation,
} from './sessionMutationOrigin';

describe('session mutation origin', () => {
  it('scopes automatic mutations synchronously and restores the default', () => {
    expect(isAutomaticSessionMutation()).toBe(false);
    withAutomaticSessionMutation(() => {
      expect(isAutomaticSessionMutation()).toBe(true);
      withAutomaticSessionMutation(() => {
        expect(isAutomaticSessionMutation()).toBe(true);
      });
      expect(isAutomaticSessionMutation()).toBe(true);
    });
    expect(isAutomaticSessionMutation()).toBe(false);
  });

  it('restores the default when an automatic mutation throws', () => {
    expect(() => withAutomaticSessionMutation(() => {
      throw new Error('expected test failure');
    })).toThrow('expected test failure');
    expect(isAutomaticSessionMutation()).toBe(false);
  });
});

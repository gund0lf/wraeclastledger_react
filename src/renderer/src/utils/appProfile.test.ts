import { describe, expect, it } from 'vitest';
import { resolveUserDataPath } from '../../../shared/appProfile';

describe('resolveUserDataPath', () => {
  it('keeps the installed application on its existing profile', () => {
    expect(resolveUserDataPath('C:\\Users\\Example\\AppData\\Roaming\\WraeclastLedger', false))
      .toBe('C:\\Users\\Example\\AppData\\Roaming\\WraeclastLedger');
  });

  it('isolates development data in a stable sibling profile', () => {
    expect(resolveUserDataPath('C:\\Users\\Example\\AppData\\Roaming\\WraeclastLedger', true))
      .toBe('C:\\Users\\Example\\AppData\\Roaming\\WraeclastLedger-development');
  });
});

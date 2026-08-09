import { describe, expect, it } from 'vitest';
import { isPrereleaseVersion, resolveAutoUpdatePolicy } from '../../../shared/updatePolicy';

describe('isPrereleaseVersion', () => {
  it('recognises semantic prerelease versions without treating build metadata as prerelease', () => {
    expect(isPrereleaseVersion('1.0.74-beta.1')).toBe(true);
    expect(isPrereleaseVersion('1.0.74-rc.2+build.9')).toBe(true);
    expect(isPrereleaseVersion('1.0.74')).toBe(false);
    expect(isPrereleaseVersion('1.0.74+build.9')).toBe(false);
    expect(isPrereleaseVersion('not-a-version')).toBe(false);
  });
});

describe('resolveAutoUpdatePolicy', () => {
  it('disables updates in development on every platform', () => {
    expect(
      resolveAutoUpdatePolicy({
        isDevelopment: true,
        platform: 'linux',
        version: '1.0.74-beta.1',
        appImagePath: '/tmp/WraeclastLedger.AppImage',
      }),
    ).toEqual({ enabled: false, allowPrerelease: false, reason: 'development' });
  });

  it('requires a real AppImage runtime before enabling Linux updates', () => {
    expect(
      resolveAutoUpdatePolicy({
        isDevelopment: false,
        platform: 'linux',
        version: '1.0.74-beta.1',
      }),
    ).toEqual({ enabled: false, allowPrerelease: false, reason: 'linux-requires-appimage' });
  });

  it('enables the prerelease channel for a packaged Linux canary', () => {
    expect(
      resolveAutoUpdatePolicy({
        isDevelopment: false,
        platform: 'linux',
        version: '1.0.74-beta.1',
        appImagePath: '/home/example/Applications/WraeclastLedger.AppImage',
      }),
    ).toEqual({ enabled: true, allowPrerelease: true });
  });

  it('keeps stable packaged builds on stable updates', () => {
    expect(
      resolveAutoUpdatePolicy({
        isDevelopment: false,
        platform: 'win32',
        version: '1.0.74',
      }),
    ).toEqual({ enabled: true, allowPrerelease: false });
  });
});

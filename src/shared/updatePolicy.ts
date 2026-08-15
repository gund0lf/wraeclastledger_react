export type AutoUpdatePolicy =
  | { enabled: true; allowPrerelease: boolean }
  | {
      enabled: false;
      allowPrerelease: false;
      reason: 'development' | 'linux-requires-appimage';
    };

export interface AutoUpdateRuntime {
  isDevelopment: boolean;
  platform: string;
  version: string;
  appImagePath?: string;
}

export function isPrereleaseVersion(version: string): boolean {
  return /^\d+\.\d+\.\d+-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*(?:\+[0-9A-Za-z.-]+)?$/.test(
    version.trim(),
  );
}

export function resolveAutoUpdatePolicy(runtime: AutoUpdateRuntime): AutoUpdatePolicy {
  if (runtime.isDevelopment) {
    return { enabled: false, allowPrerelease: false, reason: 'development' };
  }

  if (runtime.platform === 'linux' && !runtime.appImagePath?.trim()) {
    return { enabled: false, allowPrerelease: false, reason: 'linux-requires-appimage' };
  }

  return {
    enabled: true,
    allowPrerelease: isPrereleaseVersion(runtime.version),
  };
}

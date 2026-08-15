const PATH_OF_PATHING_HOST = 'pathofpathing.com';

/** Navigation allow-list. Requiring HTTPS is important: URL accepts strings
 * such as `ttps://pathofpathing.com` as a custom protocol with this hostname. */
export function isPathofpathingUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && url.hostname === PATH_OF_PATHING_HOST
      && url.port === ''
      && url.username === ''
      && url.password === '';
  } catch {
    return false;
  }
}

/** An import needs an Atlas version and an allocation hash in addition to a
 * safe origin. Path of Pathing remains responsible for decoding the hash. */
export function isPathofpathingTreeUrl(value: string): boolean {
  if (!isPathofpathingUrl(value)) return false;
  const url = new URL(value);
  const version = url.searchParams.get('v') ?? '';
  const allocation = url.hash.slice(1);
  const safeVersion = /^\d+\.\d+\.\d+(?:-[a-z0-9]+)*$/i.test(version)
    && /(?:^|-)atlas(?:-|$)/i.test(version);
  return safeVersion
    && allocation.length >= 16
    && /^[a-z0-9_-]+$/i.test(allocation);
}

/** A session replacement also changes atlasTreeUrl, but that change is already
 * owned by the session-reset effect. Treating it as an external import races
 * against the reset and incorrectly auto-reads stats from the empty tree. */
export function shouldAutoApplyExternalAtlasView(
  sessionIdentityChanged: boolean,
  nextViewUrl: string,
  capturedUrl: string,
  sourceUrl: string,
): boolean {
  return !sessionIdentityChanged
    && nextViewUrl !== capturedUrl
    && nextViewUrl !== sourceUrl;
}

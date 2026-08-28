import { isAllowedPathOfPathingUrl, isSafeStrategyAtlasUrl } from '../../../shared/atlasReaderSafety';

export { isSafeStrategyAtlasUrl };

/** Navigation allow-list. Requiring HTTPS is important: URL accepts strings
 * such as `ttps://pathofpathing.com` as a custom protocol with this hostname. */
export function isPathofpathingUrl(value: string): boolean {
  return isAllowedPathOfPathingUrl(value);
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
    && /^[a-z0-9_-]+={0,2}$/i.test(allocation);
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

/** The guest source is deliberately frozen while mounted so an in-page hash
 * edit cannot be fed back into the live webview. Before a remount, however,
 * the latest captured guest URL must become the new source or reopening a
 * hidden Atlas tab will restore the originally loaded allocation. */
export function atlasRemountSource(sourceUrl: string, capturedUrl: string): string {
  return isPathofpathingUrl(capturedUrl) ? capturedUrl : sourceUrl;
}

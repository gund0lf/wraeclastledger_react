const PATH_OF_PATHING_HOST = 'pathofpathing.com'
const MAX_EXTERNAL_URL_LENGTH = 2_048

function hasSafeUrlText(rawUrl: string): boolean {
  return rawUrl.length > 0
    && rawUrl.length <= MAX_EXTERNAL_URL_LENGTH
    && rawUrl === rawUrl.trim()
    && !/[\u0000-\u001f\u007f]/.test(rawUrl)
}

function parseAtlasUrl(rawUrl: string): URL | null {
  if (!hasSafeUrlText(rawUrl)) return null
  try {
    const url = new URL(rawUrl);
    return url.protocol === 'https:'
      && url.port === ''
      && url.username === ''
      && url.password === '' ? url : null;
  } catch {
    return null;
  }
}

export function isAllowedPathOfPathingUrl(rawUrl: string): boolean {
  return parseAtlasUrl(rawUrl)?.hostname === PATH_OF_PATHING_HOST
}

/** Community strategies may contain older Path of Pathing links that predate
 * the current version query. They remain safe to open when the origin is exact
 * and an allocation fragment is present, even if they are too old to import. */
export function isSafeStrategyAtlasUrl(rawUrl: string): boolean {
  const url = parseAtlasUrl(rawUrl)
  return url !== null && url.hash.length > 1
    && (url.hostname === PATH_OF_PATHING_HOST || url.hostname === 'atlas.wraeclastledger.com')
}

/** The main process is the final authority for renderer-requested OS links. */
export function isAllowedExternalUrl(rawUrl: string): boolean {
  if (!hasSafeUrlText(rawUrl)) return false
  try {
    const url = new URL(rawUrl)
    const hasSafeAuthority = url.port === '' && url.username === '' && url.password === ''
    if (!hasSafeAuthority) return false

    if (url.protocol === 'https:') {
      if (url.hostname === PATH_OF_PATHING_HOST) return isSafeStrategyAtlasUrl(rawUrl)
      if (url.hostname === 'wealthyexile.com' || url.hostname === 'www.wealthyexile.com') return true
      return url.hostname === 'www.pathofexile.com'
        && url.pathname.startsWith('/trade/search/')
    }

    return url.protocol === 'discord:'
      && url.hostname === 'discord.com'
      && /^\/channels\/\d+\/\d+\/\d+$/.test(url.pathname)
  } catch {
    return false
  }
}

/**
 * Deduplicate identical work while serialising distinct keys. This keeps the
 * hidden atlas reader at one BrowserWindow without returning one tree's stats
 * to a caller that requested a different URL.
 */
export function createKeyedSerialTask<TKey, TResult>(
  task: (key: TKey) => Promise<TResult>,
): (key: TKey) => Promise<TResult> {
  let tail: Promise<void> = Promise.resolve();
  const pending = new Map<TKey, Promise<TResult>>();

  return (key: TKey): Promise<TResult> => {
    const existing = pending.get(key);
    if (existing) return existing;

    const result = tail.then(() => task(key));
    tail = result.then(() => undefined, () => undefined);
    pending.set(key, result);

    const clear = (): void => {
      if (pending.get(key) === result) pending.delete(key);
    };
    void result.then(clear, clear);
    return result;
  };
}

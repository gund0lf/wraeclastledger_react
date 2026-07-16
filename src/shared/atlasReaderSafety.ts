export function isAllowedPathOfPathingUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return url.protocol === 'https:' && url.hostname === 'pathofpathing.com';
  } catch {
    return false;
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

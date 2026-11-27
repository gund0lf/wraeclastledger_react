/** Released desktop clients keep this origin until a coordinated migration. */
export const PRODUCTION_STRATEGY_API_ORIGIN = 'https://api.wraeclastledger.com'

/** Packaged clients cannot redirect author capabilities through an environment
 * override. Unpackaged development may opt in only to a loopback fixture. */
export function authorServiceOrigin({ packaged, development, reviewOrigin }: {
  packaged: boolean; development: boolean; reviewOrigin: string | undefined
}): string | null {
  if (packaged) return PRODUCTION_STRATEGY_API_ORIGIN
  if (!development || !reviewOrigin) return null
  try {
    const u = new URL(reviewOrigin)
    return u.protocol === 'http:' && u.hostname === '127.0.0.1' && !!u.port &&
      !u.username && !u.password && u.pathname === '/' && !u.search && !u.hash ? u.origin : null
  } catch { return null }
}

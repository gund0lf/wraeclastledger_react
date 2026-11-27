import { restoreIconArt, saveIconArt } from './iconCatalogueStore';

type Family = 'exchange' | 'stash';
type Response = Awaited<ReturnType<Window['api']['fetchEconomyIcons']>>;
export interface IconCatalogue {
  family: Family;
  league: string;
  type: string;
  response?: Response;
}

// Retry-After may be a delay in seconds or an HTTP date.
export function iconRetryDelay(value: string | null | undefined, now: number): number {
  if (value && /^\d+$/.test(value)) return Number(value) * 1000;
  const date = value && /GMT$/.test(value) ? Date.parse(value) : NaN;
  return Number.isFinite(date) ? Math.max(0, date - now) : 60_000;
}

let providerReadyAt = 0;
const cooldownKey = 'wl-item-art-retry-at';

export function iconProviderWait(): number {
  try {
    const stored = Number(localStorage.getItem(cooldownKey));
    if (Number.isFinite(stored)) providerReadyAt = Math.max(providerReadyAt, stored);
  } catch { /* local storage is optional */ }
  return Math.max(0, providerReadyAt - Date.now());
}

export function observeIconCooldown(result: Response | null): number {
  if (result?.status !== 429 && result?.status !== 503) return 0;
  const wait = Math.max(iconRetryDelay(result.retryAfter, Date.now()), 1_000);
  providerReadyAt = Math.max(providerReadyAt, Date.now() + wait);
  try { localStorage.setItem(cooldownKey, String(providerReadyAt)); } catch { /* in-memory fallback */ }
  return wait;
}

// Yield successful categories to the renderer before waiting for a retry.
// Preserve input order for current-league artwork and category identity.
export class IconCatalogueLoader {
  private pending: IconCatalogue[];
  private retries = 0;

  constructor(readonly catalogues: IconCatalogue[]) {
    this.pending = catalogues.slice();
  }

  async restore(): Promise<boolean> {
    this.pending = await restoreIconArt(this.catalogues);
    return this.catalogues.some(entry => entry.response !== undefined);
  }

  get needsRefresh(): boolean {
    return this.pending.length > 0;
  }

  async load(): Promise<number | null> {
    const remaining = iconProviderWait();
    if (remaining) return remaining;
    const failures: IconCatalogue[] = [];
    const updates: IconCatalogue[] = [];
    let cooldown = 0;
    while (this.pending.length && !cooldown) {
      const batch = this.pending.splice(0, 3);
      await Promise.all(batch.map(async entry => {
        try {
          const result = await window.api.fetchEconomyIcons(entry.family, entry.league, entry.type);
          if (result && Array.isArray(result.icons)) {
            entry.response = result;
            updates.push(entry);
            return;
          }
          if (result?.status === 429 || result?.status === 503) {
            cooldown = Math.max(cooldown, observeIconCooldown(result));
          } else if (result?.status && result.status < 500 && result.status !== 408) {
            return;
          }
        } catch {
          // Transport errors are eligible for the same bounded retry as timeouts.
        }
        failures.push(entry);
      }));
    }
    this.pending.push(...failures);
    await saveIconArt(updates);
    if (!this.pending.length || this.retries >= 3) return null;
    return Math.max(cooldown, 15_000 * 2 ** this.retries++);
  }
}

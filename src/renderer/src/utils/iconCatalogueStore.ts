import type { IconCatalogue } from './iconCatalogueLoader';
import { isLeagueEnded } from './league';

const DAY = 24 * 60 * 60 * 1000;
const STORE = 'catalogues';
let connection: Promise<IDBDatabase> | undefined;

export function isIconArtFresh(league: string, savedAt: number, now: number): boolean {
  const lifetime = league === 'Standard' || isLeagueEnded(league, now) ? 7 * DAY : DAY;
  const age = now - savedAt;
  return age >= 0 && age < lifetime;
}

function database(): Promise<IDBDatabase> {
  if (!connection) {
    connection = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('wl-item-art-v1', 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Icon cache unavailable'));
    });
  }
  return connection;
}

function key(entry: IconCatalogue): string[] {
  return [entry.league, entry.family, entry.type];
}

function complete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => reject(transaction.error);
  });
}

// Load stale artwork too, so a throttled or offline refresh can keep displaying it.
export async function restoreIconArt(entries: IconCatalogue[]): Promise<IconCatalogue[]> {
  const fresh = new Set<IconCatalogue>();
  try {
    const db = await database();
    const tx = db.transaction(STORE, 'readonly');
    const done = complete(tx);
    const now = Date.now();
    for (const entry of entries) {
      const request = tx.objectStore(STORE).get(key(entry));
      request.onsuccess = () => {
        const row = request.result;
        if (!row || !Array.isArray(row.icons) || !Array.isArray(row.names) || !Array.isArray(row.slugs)) return;
        entry.response = { icons: row.icons, names: row.names, slugs: row.slugs, error: null };
        if (isIconArtFresh(entry.league, row.savedAt, now)) fresh.add(entry);
      };
    }
    await done;
  } catch {
    // A missing or disabled database falls back to the normal bounded loader.
  }
  return entries.filter(entry => !fresh.has(entry));
}

export async function saveIconArt(entries: IconCatalogue[]): Promise<void> {
  if (!entries.length) return;
  try {
    const db = await database();
    const tx = db.transaction(STORE, 'readwrite');
    const done = complete(tx);
    const savedAt = Date.now();
    for (const entry of entries) {
      const result = entry.response;
      if (result?.icons) {
        tx.objectStore(STORE).put({
          icons: result.icons, names: result.names ?? [], slugs: result.slugs ?? [], savedAt,
        }, key(entry));
      }
    }
    await done;
  } catch {
    // Quota and storage failures leave the in-memory catalogue usable.
  }
}

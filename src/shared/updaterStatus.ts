export type UpdaterPhase = 'idle' | 'checking' | 'downloading' | 'failed' | 'ready' | 'current';
export interface UpdaterStatus {
  sequence: number;
  phase: UpdaterPhase;
  version: string | null;
  failure: 'check' | 'download' | null;
}
export const INITIAL_UPDATER_STATUS: UpdaterStatus = { sequence: 0, phase: 'idle', version: null, failure: null };

export function isUpdaterVersion(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 80
    && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(value);
}

/** Project only the bounded public status, never diagnostic payloads. */
export function readUpdaterStatus(value: unknown): UpdaterStatus | null {
  if (!value || typeof value !== 'object') return null;
  const status = value as Partial<UpdaterStatus>;
  if (!Number.isSafeInteger(status.sequence) || status.sequence! < 0
    || !['idle', 'checking', 'downloading', 'failed', 'ready', 'current'].includes(status.phase ?? '')
    || (status.version !== null && !isUpdaterVersion(status.version))
    || (status.failure !== null && status.failure !== 'check' && status.failure !== 'download')) return null;
  if ((status.phase === 'downloading' || status.phase === 'ready') && !status.version) return null;
  if ((status.phase === 'failed') !== (status.failure !== null)) return null;
  return { sequence: status.sequence!, phase: status.phase!, version: status.version!, failure: status.failure! };
}

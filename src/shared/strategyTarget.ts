import { AUTHOR_UUID } from './authorHandoff'

/** Session-owned intent only. A saved target never grants author authority. */
export type StrategyTarget = {
  version: 1; state: 'ready' | 'acknowledged'; operation: 'replace' | 'evidence'
  id: string; title: string; revision: number; registrationId: string
  scope: 'current'; generation: string
  seed: { version: 1 | 2; fingerprint: string } | null
} | {
  version: 1; state: 'legacy_review'
  replace: { id: string; title: string } | null
  evidence: { id: string; title: string; revision: number | null; fingerprint: string | null } | null
}
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const uuid = (v: unknown): v is string => typeof v === 'string' && AUTHOR_UUID.test(v)
const title = (v: unknown): v is string => typeof v === 'string' && v.length <= 160
const revision = (v: unknown): v is number => Number.isInteger(v) && Number(v) > 0 && Number(v) <= 2147483647
const hash = (v: unknown): v is string => typeof v === 'string' && /^sha256-v1:[0-9a-f]{64}$/.test(v)
const keys = (v: Record<string, unknown>, names: string) => Object.keys(v).sort().join(',') === names.split(',').sort().join(',')
export function isStrategyTarget(v: unknown): v is StrategyTarget {
  if (!obj(v) || v.version !== 1) return false
  if (v.state === 'legacy_review') return keys(v, 'version,state,replace,evidence') && !!(v.replace || v.evidence) &&
    (v.replace === null || obj(v.replace) && keys(v.replace, 'id,title') && uuid(v.replace.id) && title(v.replace.title)) &&
    (v.evidence === null || obj(v.evidence) && keys(v.evidence, 'id,title,revision,fingerprint') && uuid(v.evidence.id) && title(v.evidence.title) &&
      (v.evidence.revision === null || revision(v.evidence.revision)) && (v.evidence.fingerprint === null || hash(v.evidence.fingerprint)))
  return keys(v, 'version,state,operation,id,title,revision,registrationId,scope,generation,seed') &&
    ['ready', 'acknowledged'].includes(String(v.state)) && ['replace', 'evidence'].includes(String(v.operation)) &&
    uuid(v.id) && title(v.title) && revision(v.revision) && uuid(v.registrationId) && v.scope === 'current' && uuid(v.generation) &&
    (v.operation === 'replace' ? v.seed === null : obj(v.seed) && keys(v.seed, 'version,fingerprint') &&
      [1, 2].includes(Number(v.seed.version)) && hash(v.seed.fingerprint))
}

export const LEGACY_TARGET_KEYS = ['updateTargetStrategyId', 'updateTargetStrategyName', 'evidenceTargetStrategyId',
  'evidenceTargetStrategyName', 'evidenceTargetExpectedRevision', 'evidenceTargetSetupFingerprint'] as const

/** Upgrade before defaults are filled; retain both old candidates if they conflict. */
export function migrateStrategyTarget(settings: Record<string, unknown>): StrategyTarget | null {
  if (settings.strategyTarget !== undefined && settings.strategyTarget !== null) {
    if (!isStrategyTarget(settings.strategyTarget)) throw new Error('Saved strategy target is unsupported; keep this session for recovery.')
    return settings.strategyTarget
  }
  const name = (v: unknown) => typeof v === 'string' ? v.slice(0, 160) : ''
  const replace = uuid(settings.updateTargetStrategyId) ? { id: settings.updateTargetStrategyId, title: name(settings.updateTargetStrategyName) } : null
  const evidence = uuid(settings.evidenceTargetStrategyId) ? { id: settings.evidenceTargetStrategyId, title: name(settings.evidenceTargetStrategyName),
    revision: revision(settings.evidenceTargetExpectedRevision) ? settings.evidenceTargetExpectedRevision : null,
    fingerprint: hash(settings.evidenceTargetSetupFingerprint) ? settings.evidenceTargetSetupFingerprint : null } : null
  return replace || evidence ? { version: 1, state: 'legacy_review', replace, evidence } : null
}

export function withStrategyTarget<T extends object>(settings: T, target: StrategyTarget | null): T & { strategyTarget: StrategyTarget | null } {
  if (target !== null && !isStrategyTarget(target)) throw new Error('Invalid strategy target')
  return { ...settings, ...Object.fromEntries(LEGACY_TARGET_KEYS.map((key) => [key, null])), strategyTarget: target }
}

export function acknowledgeStrategyTarget(target: StrategyTarget | null, generation: string, id: string, committedRevision: number): StrategyTarget | null {
  if (!target || target.state !== 'ready' || target.generation !== generation || target.id !== id ||
    committedRevision !== target.revision + (target.operation === 'replace' ? 1 : 0)) return target
  // Remember the exact completed revision without arming a further mutation.
  return { ...target, revision: committedRevision, state: 'acknowledged' }
}

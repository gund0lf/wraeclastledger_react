import type { CovensImport } from './covensImport'
type Price = { unit: 'chaos' | 'divine'; amount: number } | null
type Observation = { count: number; sum: number } | null
export interface CovensWire {
  version: 1
  threads: (NonNullable<CovensImport['threads']>[number] & { price_each: Price })[] | null
  ember: { id: string; price_each: Price } | null
  atlas: CovensImport['atlas']
  orbs: { id: string; used: number; price_each: Price }[] | null
  atlas_drops: Observation
  more_threads: Observation
  delirium: {
    resolution: 'exact' | 'bands'
    levels: [number, number][]
    rewards: [string, number][]
  } | null
  encounters: {
    readable: number
    unknown: number
    confirmed: Record<'mirage' | 'beyond' | 'sentinel' | 'wildwood' | 'delirium', number>
  } | null
}
export function validCovens(value: unknown, maps: number): value is CovensWire

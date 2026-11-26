import type { CovensWire } from './covensWireValidator.mjs'

export function compactCovensCard(text: string): string
export function covensExportLines(
  fields: CovensWire,
  maps: number,
  totalOrbCost: number | null,
  labels: {
    items: Record<string, string>
    choices: Record<string, { name: string; options: { id: string; text: string }[] }>
  }
): string[]

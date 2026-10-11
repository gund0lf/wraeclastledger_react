import type { AuthorBridge } from '../../../shared/authorHandoff'
import { decodeDiscordSharePayload } from './discordShareWire'

export interface ShareDraftFields {
  title: string
  notes: string
  tags: string[]
  group: boolean
  groupSize: number
  time: string
}

/** Decode with the existing wire validator; never restore run data or authority. */
export function shareDraftFields(core: string): ShareDraftFields {
  const parsed = decodeDiscordSharePayload(core)
  if (!parsed || parsed.operationError || parsed.updateStrategyId || parsed.evidenceTargetStrategyId)
    throw new Error('The saved sharing details cannot be read. Keep this session and review its recovery data.')
  return { title: parsed.strategyName, notes: parsed.strategyNotes, tags: [...parsed.typeTags],
    group: parsed.isGroupPlay, groupSize: parsed.groupSize ?? 2,
    time: parsed.sessionMinutes == null ? '' : String(parsed.sessionMinutes) }
}

/** Undefined means superseded: neither fields nor an error may affect the next view. */
export async function restoreShareDraft(bridge: AuthorBridge, sessionId: string, sessionIdentity: string,
  isCurrent: () => boolean): Promise<ShareDraftFields | null | undefined> {
  try {
    const result = await bridge({ action: 'share-draft', sessionId, sessionIdentity })
    if (!isCurrent()) return undefined
    if (!result.ok) throw new Error(result.error)
    return result.value === null ? null : shareDraftFields(result.value.core)
  } catch (error) {
    if (!isCurrent()) return undefined
    throw error
  }
}

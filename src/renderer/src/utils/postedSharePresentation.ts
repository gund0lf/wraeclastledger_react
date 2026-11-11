import type { ShareDisplaySnapshot } from '../../../shared/durableShare'
import { decodeDiscordSharePayload } from './discordShareWire'
import { formatDiscordExport } from './discordExport'
import { compactPostedCardPreview } from './exportBudget'

/** Historical fields and the preview share one accepted payload. Missing or
 * invalid bytes never fall back to the currently selected session's values. */
export function postedSharePresentation(snapshot: ShareDisplaySnapshot | null) {
  if (!snapshot) return null
  const parsed = decodeDiscordSharePayload(snapshot.core)
  if (!parsed || parsed.operationError || parsed.lootSummaryInvalid) {
    throw new Error('The saved posted details could not be read. Open the Strategy Browser to view this share.')
  }
  return {
    title: parsed.strategyName, notes: parsed.strategyNotes, tags: parsed.typeTags,
    group: parsed.isGroupPlay, groupSize: parsed.groupSize,
    time: parsed.sessionMinutes == null ? '' : String(parsed.sessionMinutes),
    preview: compactPostedCardPreview(formatDiscordExport(parsed), parsed.lootSummary),
  }
}

import type { DiscordImport } from './parseDiscordExport';
import { isSafeStrategyAtlasUrl } from './atlasUrl';

type ShareCompletenessFields = Pick<DiscordImport,
  'atlasTreeUrl' | 'totalInvest' | 'totalReturn' | 'mapCount'>;

/** Mirrors the Discord bot's minimum submission gate for immediate feedback. */
export function missingShareFields(parsed: ShareCompletenessFields | null): string[] {
  if (!parsed) return ['A parseable WraeclastLedger export'];
  const missing: string[] = [];
  if (!isSafeStrategyAtlasUrl(parsed.atlasTreeUrl)) {
    missing.push('Atlas tree with an allocation hash');
  }
  if (!Number.isFinite(parsed.totalInvest) || parsed.totalInvest <= 0) {
    missing.push('Total invest above 0');
  }
  if (!Number.isFinite(parsed.totalReturn) || parsed.totalReturn <= 0) {
    missing.push('Total return above 0');
  }
  if (!Number.isInteger(parsed.mapCount) || parsed.mapCount < 5) {
    missing.push('At least 5 parsed maps');
  }
  return missing;
}

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string): string => readFileSync(
  new URL(relativePath, import.meta.url),
  'utf8',
);

const sessionsSource = read('../modules/SessionManagerModule.tsx');
const guardSource = read('../components/WorkingSessionGuardModal.tsx');
const shareSource = read('../components/ShareModal.tsx');
const runtimeSource = read('../repository/sessionRepositoryRuntime.ts');
const atlasCalcSource = read('../modules/AtlasCalcModule.tsx');
const atlasTreeSource = read('../modules/AtlasTreeModule.tsx');

describe('Sessions and Share intent-continuity presentation contract', () => {
  it('keeps ordinary same-league browsing out of the warning stack', () => {
    expect(sessionsSource).toContain("sessionLifecycle === 'historical' && crossLeague");
    expect(sessionsSource).toContain('Viewing saved session');
    expect(sessionsSource).toContain('Resume capture');
    expect(sessionsSource).toContain('capture target');
    expect(sessionsSource).not.toContain('Return to live session');
    expect(sessionsSource).not.toContain("title={crossLeague ? 'Previous-league session' : 'Historical session'}");
  });

  it('uses current-league consequences only at the real league boundary', () => {
    expect(sessionsSource).toContain('title={`Previous league: ${settings.leagueName}`}');
    expect(sessionsSource).toContain('Fork into {confirmedLeague}');
    expect(sessionsSource).toContain('Start empty {confirmedLeague} session');
  });

  it('makes saving the working slot explicit and removes repository jargon', () => {
    expect(sessionsSource).toContain("title={isUnsaved ? 'Save to Sessions' : 'Duplicate session'}");
    expect(sessionsSource).toContain('already auto-saved');
    expect(guardSource).toContain('title="Keep this working session?"');
    expect(guardSource).toContain('Continue without saving');
    expect(guardSource).toContain('Save to Sessions');
    expect(guardSource).not.toContain('Move &amp; continue');
    expect(guardSource).not.toContain('Name &amp; continue');
  });

  it('shows a transient compact Undo only after an authored activation checkpoint', () => {
    expect(sessionsSource).toContain('className="session-manager-undo-toast"');
    expect(sessionsSource).toContain('setTimeout(dismissActivationCheckpointNotice, 10_000)');
    expect(sessionsSource).not.toContain('title="Changes are protected"');
    expect(runtimeSource).toContain('queueSessionSave(discrete, !isAutomaticSessionMutation())');
    expect(runtimeSource).toContain('queueSessionSave(true, false)');
    expect(runtimeSource).toContain('previous?.activationId ?? next.activationId');
    expect(atlasCalcSource).toContain("updateSetting('mapType', inferred, 'automatic')");
    expect(atlasTreeSource).toContain("readPoints('automatic')");
  });

  it('reduces compatible destinations to status plus Change and prioritizes safe fallback', () => {
    expect(shareSource).toContain('className="share-target-status"');
    expect(shareSource).toContain('Add this run to');
    expect(shareSource).toContain('>Change</Button>');
    expect(shareSource).toContain('Publish as a separate strategy');
    expect(shareSource).toContain('Replace published strategy');
    expect(shareSource).toContain('Show setup differences');
    expect(shareSource).not.toContain('Replace instead');
    expect(shareSource).not.toContain('Share as new</Button>');
  });
});

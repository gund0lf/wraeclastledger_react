import { describe, expect, it } from 'vitest';
import {
  SESSION_PAYLOAD_KEYS,
  SESSION_PAYLOAD_PORTABLE_KEY_BY_PAYLOAD_KEY,
  createSessionPayload,
  hasExactSessionPayloadKeys,
  portableFieldsFromSessionPayload,
  sessionPayloadFromPortableFields,
} from '../../../shared/sessionPayload';
import { DEFAULT_SETTINGS } from '../store/useSessionStore';
import {
  decodeSessionPayload,
  encodeSessionPayload,
  SESSION_PAYLOAD_STATE_KEY_BY_PAYLOAD_KEY,
} from '../repository/sessionPayloadCodec';

describe('WP14 session payload codec', () => {
  it('encodes and decodes every session-owned runtime field through one exact contract', () => {
    const encoded = encodeSessionPayload({
      maps: [],
      lootItems: [],
      baselineItems: [],
      baselineTotal: 17,
      manualLootItems: [{
        id: 'manual-chart',
        name: 'Chart (Abyssal Plain)',
        quantity: 1,
        total: 120,
        category: 'League',
        note: '',
        identity: { kind: 'chart', chart: 'Chart (Abyssal Plain)' },
      }],
      manualStatistics: {
        wildwoodEncounters: 3,
        setupProvenance: {
          wildwood: {
            contexts: [{
              schemaVersion: 1,
              modelRevision: 'allflame-v1',
              captureSource: 'manual-entry',
              leagueName: 'Allflame',
              atlasSource: 'unavailable',
              atlasTreeUrl: null,
              atlasDetectedTags: [],
              scarabNames: ['Scarab of Wisps'],
            }],
          },
        },
      },
      manualRunTimer: { accumulatedMs: 90_000, runningSince: null, lastHeartbeatAt: null, finishedAt: null },
      settings: { ...DEFAULT_SETTINGS, divinePrice: 211 },
      sessionNotes: 'codec note',
      investmentNeutralization: 29,
      investmentDismissed: true,
      loadedStrategyInfo: null,
    });

    expect(hasExactSessionPayloadKeys(encoded)).toBe(true);
    expect(Object.keys(encoded).sort()).toEqual([...SESSION_PAYLOAD_KEYS].sort());
    expect(Object.keys(SESSION_PAYLOAD_STATE_KEY_BY_PAYLOAD_KEY).sort())
      .toEqual([...SESSION_PAYLOAD_KEYS].sort());
    expect(Object.keys(SESSION_PAYLOAD_PORTABLE_KEY_BY_PAYLOAD_KEY).sort())
      .toEqual([...SESSION_PAYLOAD_KEYS].sort());
    expect(new Set(Object.values(SESSION_PAYLOAD_STATE_KEY_BY_PAYLOAD_KEY)).size)
      .toBe(SESSION_PAYLOAD_KEYS.length);
    expect(new Set(Object.values(SESSION_PAYLOAD_PORTABLE_KEY_BY_PAYLOAD_KEY)).size)
      .toBe(SESSION_PAYLOAD_KEYS.length);
    expect(decodeSessionPayload(encoded, DEFAULT_SETTINGS)).toMatchObject({
      baselineTotal: 17,
      manualLootItems: [{
        id: 'manual-chart',
        identity: { kind: 'chart', chart: 'Chart (Abyssal Plain)' },
      }],
      manualStatistics: {
        wildwoodEncounters: 3,
        setupProvenance: {
          wildwood: {
            contexts: [{
              schemaVersion: 1,
              modelRevision: 'allflame-v1',
              captureSource: 'manual-entry',
              leagueName: 'Allflame',
              atlasSource: 'unavailable',
              atlasTreeUrl: null,
              atlasDetectedTags: [],
              scarabNames: ['Scarab of Wisps'],
            }],
          },
        },
      },
      manualRunTimer: { accumulatedMs: 90_000, runningSince: null, lastHeartbeatAt: null, finishedAt: null },
      settings: { divinePrice: 211 },
      sessionNotes: 'codec note',
      investmentNeutralization: 29,
      investmentDismissed: true,
      loadedStrategyInfo: null,
    });
  });

  it('round-trips every payload field through the portable import/export names', () => {
    const payload = createSessionPayload({
      maps: [{ marker: 'maps' }],
      lootItems: [{ marker: 'loot' }],
      baselineItems: [{ marker: 'baseline' }],
      baselineTotal: 101,
      manualLootItems: [{ marker: 'manual-loot' }],
      manualStatistics: { marker: 'manual-statistics' },
      manualRunTimer: { accumulatedMs: 123, runningSince: null, lastHeartbeatAt: null, finishedAt: null },
      settings: { marker: 'settings' },
      sessionNotes: 'portable note',
      investmentNeutralization: 202,
      investmentDismissed: true,
      strategySourceContext: { marker: 'strategy-source' },
    });

    expect(sessionPayloadFromPortableFields(portableFieldsFromSessionPayload(payload))).toEqual(payload);
  });
});

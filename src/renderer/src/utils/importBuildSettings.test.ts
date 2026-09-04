import { describe, expect, it } from 'vitest';
import { buildDiscordSharePayload, decodeDiscordSharePayload } from './discordShareWire';
import { applyImportedMapType } from './importBuildSettings';
import { buildImportedSetupPlan } from './investmentSetup';
import { parseDiscordExport } from './parseDiscordExport';

const readableImport = (mapTypeLine: string, extras = ''): string => `
WraeclastLedger — Session Export
Maps: 12
${mapTypeLine}
Multiplier: 1.00x
${extras}
`.trim();

describe('applyImportedMapType', () => {
  it('applies an authored 8-mod readable import without requiring a Run regex', () => {
    const parsed = parseDiscordExport(readableImport('Type: 8-mod'));
    const applied: string[] = [];

    expect(parsed).not.toBeNull();
    expect(parsed!.runRegex).toBe('');
    expect(applyImportedMapType(parsed!.mapType, (mapType) => applied.push(mapType))).toBe(true);
    expect(applied).toEqual(['8-mod']);
  });

  it('applies 6-mod from the compact parser shape with Risk and a Run regex present', () => {
    const readable = parseDiscordExport(readableImport('Type: 6-mod', [
      '- Cartography Scarab of Risk (10c)',
      'Run: "ack.*([4-9].|\\d..)%"',
    ].join('\n')));
    expect(readable).not.toBeNull();

    const compact = decodeDiscordSharePayload(buildDiscordSharePayload(readable!));
    const applied: string[] = [];

    expect(compact).not.toBeNull();
    expect(compact!.scarabs).toContain('Cartography Scarab of Risk');
    expect(compact!.runRegex).not.toBe('');
    expect(applyImportedMapType(compact!.mapType, (mapType) => applied.push(mapType))).toBe(true);
    expect(applied).toEqual(['6-mod']);
  });

  it('supports repeated imports without retaining the previous valid value', () => {
    const applied: string[] = [];
    const apply = (mapType: '6-mod' | '8-mod') => applied.push(mapType);

    applyImportedMapType('8-mod', apply);
    applyImportedMapType('6-mod', apply);

    expect(applied).toEqual(['8-mod', '6-mod']);
  });

  it('clones the same setup-only plan from readable and compact imports', () => {
    const readable = parseDiscordExport(readableImport('Type: 8-mod', [
      'Chisel: Avarice (40c each)',
      '- Horned Scarab of Awakening (75c)',
      'Delirium Orbs: 3x Fine @ 85c ea',
      'Astrolabe: Grasping · 7x @ 10c ea',
    ].join('\n')));
    expect(readable).not.toBeNull();
    const compact = decodeDiscordSharePayload(buildDiscordSharePayload(readable!));
    expect(compact).not.toBeNull();

    const toPlan = (source: NonNullable<typeof readable>) => buildImportedSetupPlan({
      mapType: source.mapType,
      chisel: source.chisel,
      scarabs: source.scarabs,
      deliriumType: source.deliOrbType,
      deliriumCountPerMap: source.deliOrbQty,
      astrolabeType: source.astroType,
    });
    const expected = {
      mapType: '8-mod',
      chiselType: 'Avarice',
      scarabNames: ['Horned Scarab of Awakening'],
      deliriumType: 'Fine',
      deliriumCountPerMap: 3,
      astrolabeType: 'Grasping Astrolabe',
    };

    expect(toPlan(readable!)).toEqual(expected);
    expect(toPlan(compact!)).toEqual(expected);
  });

  it('does not apply missing, unsupported, or lookalike values', () => {
    const applied: string[] = [];
    const missing = parseDiscordExport(readableImport(''));

    expect(missing).not.toBeNull();
    expect(applyImportedMapType(missing!.mapType, (mapType) => applied.push(mapType))).toBe(false);
    expect(applyImportedMapType('8mod', (mapType) => applied.push(mapType))).toBe(false);
    expect(applyImportedMapType('10-mod', (mapType) => applied.push(mapType))).toBe(false);
    expect(applyImportedMapType(undefined, (mapType) => applied.push(mapType))).toBe(false);
    expect(applied).toEqual([]);
  });
});

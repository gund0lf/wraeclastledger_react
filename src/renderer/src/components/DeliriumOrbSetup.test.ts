import { MantineProvider } from '@mantine/core';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { decodeStrategySetupCode, encodeStrategySetupCode, isStrategySetupCode, type StrategySetupCode } from '../../../shared/strategySetupCode';
import { DEFAULT_SETTINGS } from '../store/useSessionStore';
import { buildImportPreview, type StrategyImport } from '../utils/importPreview';
import { computeRollingSessionTotal } from '../utils/profit';
import { buildSetupOnlyImportPlan } from '../utils/setupOnlyImport';
import { parseDiscordExport } from '../utils/parseDiscordExport';
import { StrategyImportPreview } from './StrategyImportPreview';

function setup(league: string, count: number): StrategySetupCode {
  return { version: 1, kind: 'setup', title: '', notes: '', league, mapType: '6-mod',
    chisel: null, scarabs: [], astrolabe: null, atlasTreeUrl: null, runRegex: '',
    delirium: { type: 'Fine', countPerMap: count } };
}

function preview(input: StrategyImport) {
  const data = buildImportPreview(input);
  return renderToStaticMarkup(createElement(MantineProvider, null, createElement(StrategyImportPreview, {
    data, divinePrice: 0, panelDivinePrice: 0, onDivinePrice: () => {}, onLoad: () => {},
  }))).replace(/<[^>]+>/g, '');
}

it('retains six paid orbs per map through setup export, decode, load and cost calculation', () => {
  const value = setup('Covens', 6);
  expect(isStrategySetupCode(value)).toBe(true);
  const saved = decodeStrategySetupCode(encodeStrategySetupCode(value))!;
  const { investment } = buildSetupOnlyImportPlan(saved);
  expect(investment.deliriumCountPerMap).toBe(6);
  expect(computeRollingSessionTotal({ ...DEFAULT_SETTINGS, advDeliOrbType: investment.deliriumType,
    advDeliOrbQtyPerMap: investment.deliriumCountPerMap, advDeliOrbPriceEach: 3 }, 2)).toBe(36);
  expect(isStrategySetupCode(setup('Allflame', 6))).toBe(false);
  expect(isStrategySetupCode(setup('Covens', 1.5))).toBe(false);
});

it('does not infer Covens Delirium from orb spend and retains the historical layer estimate', () => {
  const current = preview({ kind: 'setup', value: setup('Covens', 2) });
  expect(current).toContain('2x Fine');
  expect(current).not.toContain('40%');
  expect(preview({ kind: 'setup', value: setup('Allflame', 2) })).toContain('(40%)');
});

it('displays the observed map percentage independently of orb expenditure', () => {
  const raw = 'WraeclastLedger\nMaps: 1\nType: 6-mod\nLeague: Covens\nDivine Price: 200c\nDelirium Orbs: 2x Fine @ 3c ea\nObserved Delirium: 1/1 maps | Levels: 65%x1 | Rewards: None';
  const value = parseDiscordExport(raw)!;
  expect(value.observedDelirium?.sampleSize).toBe(1);
  expect(preview({ kind: 'discord', value })).toContain('65%');
});

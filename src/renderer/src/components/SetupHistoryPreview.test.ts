import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MantineProvider } from '@mantine/core';
import { expect, it } from 'vitest';
import { SetupHistoryPreview } from './SetupHistoryPreview';
import { publicStrategySetup, type SetupHistory } from '../../../shared/strategySetupCode';

const emptyHistory = () => publicStrategySetup({ schema_version: 1, id: 'synthetic', revision: 1,
  setup: { map_type: '8-mod', chisel: null, scarabs: [] } })!.history!;
const render = (history: SetupHistory, approximateTotals?: { totalInvest: boolean; netProfit: boolean }) => renderToStaticMarkup(createElement(MantineProvider, null,
  createElement(SetupHistoryPreview, { history, approximateTotals, divinePrice: 400, panelDivinePrice: 400, onDivinePrice: () => {} })));

it('keeps historical economics and the inspection-only Divine comparison visible', () => {
  const markup = render({ ...emptyHistory(), maps: 60, runs: 1, costPerMap: 208, totalInvest: 12480,
    netProfit: 41730.1, divinePrice: 379, netPerMapDivines: 1.835, minutes: 160, timedMaps: 60 });
  for (const text of ['208.0c', '12480.0c', '41730.1c', '379.0c', '+104.33d', '1.739d',
    'Historical information is for inspection', 'Load Build Settings leaves new-run prices empty']) expect(markup).toContain(text);
  expect(markup).not.toContain('approximate');
});

it('shows a dash for no timed maps and keeps a measured sub-minute sample', () => {
  expect(render({ ...emptyHistory(), minutes: 0, timedMaps: 0 })).not.toContain('&lt;1m');
  expect(render({ ...emptyHistory(), minutes: 0.5, timedMaps: 1 })).toContain('&lt;1m');
});

it('labels rounded totals and their derived comparisons without marking exact prices', () => {
  const markup = render({ ...emptyHistory(), maps: 20, costPerMap: 100, totalInvest: 15372.5,
    netProfit: 18791, divinePrice: 215 }, { totalInvest: true, netProfit: true });
  for (const text of ['\u224815372.5c', '\u224818791.0c', '\u2248+46.98d', '\u22482.349d',
    'Totals converted from rounded Discord Divine amounts are approximate.']) expect(markup).toContain(text);
  expect(markup).not.toContain('\u2248100.0c');
  expect(markup).not.toContain('\u2248215.0c');
  const mixed = render({ ...emptyHistory(), maps: 20, totalInvest: 100, netProfit: -107.5 },
    { totalInvest: false, netProfit: true });
  expect(mixed).not.toContain('\u2248100.0c');
  expect(mixed).toContain('\u2248-107.5c');
  expect(mixed).toContain('\u2248-0.27d');
});
it('labels absent values unrecorded while preserving explicit zero and signed loss', () => {
  const missing = render(emptyHistory());
  expect(missing).toContain('–');
  expect(missing).toContain('Unavailable');
  expect(missing).not.toContain('+0.00d');
  const recorded = render({ ...emptyHistory(), maps: 10, runs: 1, totalInvest: 0, netProfit: -100 });
  expect(recorded).toContain('0.0c');
  expect(recorded).toContain('-100.0c');
  expect(recorded).toContain('-0.25d');
});

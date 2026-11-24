import { expect, it } from 'vitest';
import { exchangeChaosPrices } from '../../../shared/exchangeChaosPrices';

it('joins the market by id and reads a chaos price for one item', () => {
  const data = { core: { primary: 'chaos' }, items: [{ id: 'abyss-thread', name: 'Abyss Thread' }],
    lines: [{ id: 'unknown', primaryValue: 999 }, { id: 'abyss-thread', primaryValue: 2.5, maxVolumeRate: 0.4 }] };
  expect(exchangeChaosPrices(data)).toEqual([{ name: 'Abyss Thread', chaos: 2.5 }]);
  expect(exchangeChaosPrices({ ...data, core: { primary: 'divine' } })).toEqual([]);
  expect(exchangeChaosPrices({ ...data, lines: [{ id: 'abyss-thread', primaryValue: NaN }] })).toEqual([]);
});

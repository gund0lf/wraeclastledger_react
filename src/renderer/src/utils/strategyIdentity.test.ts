import { describe, expect, it } from 'vitest';
import { strategyRowIdentity } from './strategyIdentity';

describe('Strategy Browser row identity', () => {
  it('puts the authored strategy title above author and pooled run count', () => {
    expect(strategyRowIdentity({
      strategy_name: 'Budget Breach buy-in',
      discord_username: 'MarketMaven',
    }, 3)).toEqual({
      title: 'Budget Breach buy-in',
      attribution: 'by MarketMaven · 3 runs',
    });
  });

  it('keeps long authored values intact for UI truncation and hover text', () => {
    const title = 'A deliberately long strategy title that exceeds the compact row';
    const author = 'A deliberately long Discord display name';
    expect(strategyRowIdentity({ strategy_name: title, discord_username: author }, 12))
      .toEqual({ title, attribution: `by ${author} · 12 runs` });
  });

  it('uses readable legacy fallbacks for missing names and run counts', () => {
    expect(strategyRowIdentity({
      strategy_name: '   ',
      discord_username: 'LegacyAuthor',
    }, 0)).toEqual({
      title: "LegacyAuthor's strategy",
      attribution: 'by LegacyAuthor · 1 run',
    });

    expect(strategyRowIdentity({
      strategy_name: null,
      discord_username: '',
    }, Number.NaN)).toEqual({
      title: "Unknown author's strategy",
      attribution: 'by Unknown author · 1 run',
    });
  });
});

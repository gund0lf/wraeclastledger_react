import { describe, expect, it, vi } from 'vitest';
import { InputDraft } from './inputDraft';
import { parsePriceInput } from './priceUtils';
import { flushSessionInputDrafts, registerSessionInputDraft } from './sessionInputDrafts';
import { flushRepositoryNow } from '../repository/sessionRepositoryRuntime';
import { readFileSync } from 'node:fs';

const formatPrice = (value: number): string => value > 0 ? String(value) : '';
const parsePrice = (raw: string): number => parsePriceInput(raw, 300);

describe('committed input drafts', () => {
  it('leaves untouched focus/blur and repeated Tab/Shift-Tab as no-ops', () => {
    const source = { value: 15, scope: 'working:1' };
    const draft = new InputDraft(source, formatPrice);
    const parse = vi.fn(parsePrice);
    for (let i = 0; i < 10; i += 1) expect(draft.commit(source, parse)).toBeUndefined();
    expect(parse).not.toHaveBeenCalled();
    expect(draft.raw).toBe('15');
  });

  it.each(['300', '300c', '1d', '1D', '300.00c', ' 300c '])(
    'canonicalizes equivalent %s without committing', (raw) => {
      const source = { value: 300, scope: 'working:1' };
      const draft = new InputDraft(source, formatPrice);
      draft.edit(raw);
      expect(draft.commit(source, parsePrice)).toBeUndefined();
      expect(draft.raw).toBe('300');
    },
  );

  it('commits a real price once even when Enter is followed by blur before feedback', () => {
    const source = { value: 0, scope: 'working:1' };
    const draft = new InputDraft(source, formatPrice);
    draft.edit('.7d');
    expect(draft.commit(source, parsePrice)).toBe(210);
    expect(draft.commit(source, parsePrice)).toBeUndefined();
    draft.sync({ ...source, value: 210 });
    expect(draft.raw).toBe('210');
    draft.edit('');
    expect(draft.commit({ ...source, value: 210 }, parsePrice)).toBe(0);
    expect(draft.raw).toBe('');
  });

  it('does not parse or mutate the source during a typing burst', () => {
    const source = { value: 'Empower', scope: 'working:1' };
    const draft = new InputDraft(source, String);
    for (const raw of ['E', 'En', 'Enl', 'Enlighten']) draft.edit(raw);
    expect(source.value).toBe('Empower');
    expect(draft.raw).toBe('Enlighten');
    expect(draft.commit(source, String)).toBe('Enlighten');
    expect(draft.commit(source, String)).toBeUndefined();
  });

  it('preserves free-text names and makes same-option selection a no-op', () => {
    const source = { value: 'Bestiary Scarab', scope: 'working:1' };
    const draft = new InputDraft(source, String);
    draft.edit(source.value);
    expect(draft.commit(source, String)).toBeUndefined();
    draft.edit('Legacy custom name');
    expect(draft.commit(source, String)).toBe('Legacy custom name');
  });

  it.each(['working:2', 'saved:A'])('rejects late blur after switching to %s even with the same value', (scope) => {
    const draft = new InputDraft({ value: 0, scope: 'working:1' }, formatPrice);
    draft.edit('30c');
    expect(draft.commit({ value: 0, scope }, parsePrice)).toBeUndefined();
    expect(draft.raw).toBe('');
    draft.edit('40c');
    expect(draft.commit({ value: 0, scope }, parsePrice)).toBe(40);
  });

  it('lets an external preset/reset win over an unfinished draft', () => {
    const source = { value: 'Bestiary Scarab', scope: 'working:1' };
    const draft = new InputDraft(source, String);
    draft.edit('Deliri');
    expect(draft.commit({ ...source, value: 'Breach Scarab' }, String)).toBeUndefined();
    expect(draft.raw).toBe('Breach Scarab');
    draft.edit('Something else');
    draft.sync({ ...source, value: '' });
    expect(draft.raw).toBe('');
    expect(draft.commit({ ...source, value: '' }, String)).toBeUndefined();
  });

  it('keeps an in-progress draft across unrelated parent renders', () => {
    const source = { value: 15, scope: 'working:1' };
    const draft = new InputDraft(source, formatPrice);
    draft.edit('2d');
    draft.sync({ ...source });
    expect(draft.raw).toBe('2d');
    expect(draft.commit(source, parsePrice)).toBe(600);
  });

  it('flushes a focused draft through the existing repository close/switch boundary', async () => {
    let source = { value: '', scope: 'working:1' };
    const draft = new InputDraft(source, String);
    const committed = vi.fn();
    const unregister = registerSessionInputDraft(() => {
      const next = draft.commit(source, String);
      if (next !== undefined) {
        committed(next);
        source = { ...source, value: next };
      }
    });
    try {
      draft.edit('Empower');
      await flushRepositoryNow();
      expect(committed).toHaveBeenCalledExactlyOnceWith('Empower');
      flushSessionInputDrafts();
      expect(committed).toHaveBeenCalledTimes(1);
      draft.edit('Must not reach the next session');
      source = { value: '', scope: 'working:2' };
      flushSessionInputDrafts();
      expect(committed).toHaveBeenCalledTimes(1);
    } finally { unregister(); }
    draft.edit('Unmounted');
    flushSessionInputDrafts();
    expect(committed).toHaveBeenCalledTimes(1);
  });
});

describe('Investment input wiring (native interaction remains a smoke check)', () => {
  const source = readFileSync(new URL('../modules/InvestmentModule.tsx', import.meta.url), 'utf8');
  it('previews gem artwork from the local draft without committing each keystroke', () => {
    const gemInput = source.split('const GemNameInput = () => {')[1].split('const ScarabNameInput')[0];
    expect(gemInput).toContain('leftSection={raw ? <PoeItemIcon name={raw}');
    expect(gemInput).toContain('category="gem" gemPreview');
    expect(gemInput).toContain('onChange={(e) => change(e.currentTarget.value)}');
    expect(gemInput).not.toContain('const name = useSessionStore');
    const iconSource = readFileSync(new URL('../components/ui/PoeItemIcon.tsx', import.meta.url), 'utf8');
    // Cache acquisition depends on league context, not the changing name.
    expect(iconSource).toContain('}, [leagueOverride, sessionLeague]);');
  });
  it.each(['chiselOptions', 'astrolabeOptions', 'deliriumOrbOptions'])(
    '%s uses searchable Select without persisting search text', (options) => {
      const input = source.match(new RegExp(`<Select[^]*?data=\\{${options}\\}([^]*?)leftSection=`));
      expect(input?.[1]).toContain('searchable');
      expect(input?.[1]).not.toContain('onSearchChange');
    },
  );
  it('routes scarab selection through canonical values and leaves IME Enter alone', () => {
    expect(source).toContain('onOptionSubmit={(value) => { submitted.current = value; }}');
    expect(source).toContain('change(selected ?? text)');
    expect(source).toContain('!e.nativeEvent.isComposing');
    expect(source).not.toContain("onChange={(v) => updateScarab(i, 'name', v)}");
    expect(source).not.toContain("onChange={(e) => updateAdvSetting('advGemName', e.currentTarget.value)}");
  });
});

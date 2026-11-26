import { Anchor, NumberInput, Select, Stack, Text } from '@mantine/core';
import { Fragment, useEffect, useState } from 'react';
import type { SessionSettings } from '../types';
import { getManifest, preserveHistoricalSelection } from '../utils/gameData';
import { getDeviceMarketPrice } from '../utils/itemIcons';
import { deviceInvestment } from '../utils/profit';
import { PoeItemIcon } from './ui/PoeItemIcon';
import { SectionLabel } from './ui/SectionLabel';

const formatPrice = new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format;
type MarketType = 'Thread' | 'AllflameEmber';

function MarketPrice({ league, name, type, apply }: {
  league: string; name: string; type: MarketType; apply: (price: number) => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const [quote, setQuote] = useState<number | null>();
  useEffect(() => {
    let current = true;
    void getDeviceMarketPrice(league, name, attempt ? type : undefined)
      .then(price => { if (current) setQuote(price ?? null); })
      .catch(() => { if (current) setQuote(null); });
    return () => { current = false; };
  }, [league, name, type, attempt]);
  if (quote === undefined) return null;
  return <Text component="div" size="xs" c="dimmed" className="device-market">
    {quote === null ? <>Price unavailable · <Anchor component="button" type="button" size="xs"
      aria-label={'Retry market price for ' + name} onClick={() => { setQuote(undefined); setAttempt(attempt + 1); }}>Retry</Anchor></>
      : <Anchor component="button" type="button" size="xs" title={'Use market price for ' + name}
        onClick={() => apply(quote)}>Market {quote.toFixed(2)}c</Anchor>}
  </Text>;
}

export function DeviceInvestmentInputs({ settings, league, historical, readOnly, rules, update }: {
  settings: SessionSettings; league: string; historical: boolean; readOnly: boolean;
  rules: { threadSlots: number; threadCap: number };
  update: <K extends keyof SessionSettings>(key: K, value: SessionSettings[K]) => void;
}) {
  const slots = Array.from({ length: rules.threadSlots }, (_, i) =>
    settings.threadSlots?.[i] ?? { name: '', count: 1, price: 0 });
  const ember = settings.ember ?? { name: '', price: 0 };
  const manifest = getManifest();
  const options = (items: typeof manifest.threads, selected: string, trim: RegExp) => [
    { value: '', label: 'None' },
    ...preserveHistoricalSelection((items ?? []).filter(item => item.status === 'active' || item.status === 'reworked')
      .map(item => ({ value: item.name, label: item.name.replace(trim, '') })), selected),
  ];
  const changeSlot = (index: number, patch: Partial<typeof slots[number]>) =>
    update('threadSlots', slots.map((slot, i) => i === index ? { ...slot, ...patch } : slot));
  const costs = deviceInvestment(settings);
  const priced = !costs.activeSlots.some(slot => slot?.name && slot.count > 0 && !slot.price) && (!ember.name || ember.price > 0);
  const market = !historical && !readOnly;
  const label = (value: string) => <Text size="xs" c="dimmed">{value}</Text>;
  const total = (value: number | undefined) => <Text size="xs" className="device-total">{value ? formatPrice(value) + 'c' : '—'}</Text>;
  const unitPrice = (name: string, value: number, disabled: boolean, apply: (price: number) => void) =>
    <NumberInput aria-label={name + ' price each in chaos'} size="xs" hideControls min={0} suffix="c"
      disabled={disabled} value={value || ''} placeholder="—" onChange={v => apply(Math.max(0, Number(v) || 0))} />;
  return <Stack gap={5} className="device-investment">
    <SectionLabel>Map device · Threads</SectionLabel>
    {costs.oneType && <Text size="xs" c="dimmed">Unwavering Vision · one Thread type only</Text>}
    <div className="device-grid">
      {label('Thread')}{label('Paid')}{label('Price')}{label('Total')}
      {slots.map((slot, i) => {
        const lockedByTree = costs.oneType && i > 0;
        const paused = lockedByTree || slot.paused === true;
        const disabled = readOnly || lockedByTree;
        const id = 'Thread ' + (i + 1);
        return <Fragment key={i}>
          <Select aria-label={id} size="xs" searchable disabled={disabled} value={slot.name}
            leftSection={slot.name && <PoeItemIcon name={slot.name} category="thread" size={14} />} leftSectionWidth={22} rightSectionWidth={16}
            data={options(manifest.threads, slot.name, / Thread$/)} allowDeselect={false}
            onChange={name => changeSlot(i, { name: name || '', count: 1, price: 0, paused: undefined, granted: undefined })} />
          <NumberInput aria-label={id + ' count'} size="xs" hideControls allowDecimal={false} min={0} max={rules.threadCap}
            value={slot.name ? slot.count : ''} placeholder="—" disabled={disabled || !slot.name}
            onChange={v => changeSlot(i, { count: Math.max(0, Math.min(rules.threadCap, Number(v) || 0)) })} />
          {unitPrice(id, slot.price, disabled || !slot.name, price => changeSlot(i, { price }))}
          {total(!paused && slot.name ? slot.count * slot.price : undefined)}
          {slot.name && <Fragment>
            {label(paused ? 'Granted · paused' : 'Granted')}
            <NumberInput aria-label={id + ' granted count'} size="xs" hideControls allowDecimal={false} min={0}
              max={rules.threadCap} value={slot.granted ?? ''} placeholder="—" disabled={disabled}
              onChange={v => changeSlot(i, { granted: v === '' ? undefined : Math.min(rules.threadCap, Math.max(0, Number(v))) })} />
            <div className="device-grant-spacer" />
          </Fragment>}
          {market && slot.name && !paused && <MarketPrice key={league + slot.name} name={slot.name} league={league}
            type="Thread" apply={price => changeSlot(i, { price })} />}
        </Fragment>;
      })}
      </div>
    <SectionLabel>Map enchantment</SectionLabel>
    <div className="device-grid">
      <div className="device-ember">{label('Allflame Ember')}</div>{label('Price')}{label('Total')}
      <div className="device-ember"><Select aria-label="Allflame Ember" size="xs" searchable disabled={readOnly} value={ember.name}
        leftSection={ember.name && <PoeItemIcon name={ember.name} category="ember" size={14} />} leftSectionWidth={22} rightSectionWidth={16}
        data={options(manifest.embers, ember.name, /^Allflame Ember of /)} allowDeselect={false}
        onChange={name => update('ember', name ? { name, price: 0 } : undefined)} /></div>
      {unitPrice('Ember', ember.price, readOnly || !ember.name, price => update('ember', { ...ember, price }))}
      {total(costs.emberCost)}
      {market && ember.name && <MarketPrice key={league + ember.name} league={league} type="AllflameEmber" name={ember.name}
        apply={price => update('ember', { ...ember, price })} />}
    </div>
    <Text size="xs" fw={600} className="device-summary">
      {costs.paid} {costs.paid === 1 ? 'Thread' : 'Threads'}{costs.effective > costs.paid && ` (+${costs.effective - costs.paid} free)`}
      {' · '}{ember.name ? '1 Ember' : '0 Embers'}{' · '}
      {priced ? formatPrice(costs.threadCost + costs.emberCost) + 'c per map' : 'Cost incomplete'}
      {costs.paid > 0 && costs.saveChance > 0 && ` (${costs.saveChance}% chance to save Threads)`}
    </Text>
  </Stack>;
}

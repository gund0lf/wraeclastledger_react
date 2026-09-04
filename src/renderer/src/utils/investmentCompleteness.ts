import type { SessionSettings } from '../types';

export type InvestmentSectionStatus = 'empty' | 'incomplete' | 'filled';

export interface InvestmentCompleteness {
  sections: {
    baseMap: InvestmentSectionStatus;
    chisel: InvestmentSectionStatus;
    rolling: InvestmentSectionStatus;
    delirium: InvestmentSectionStatus;
    astrolabe: InvestmentSectionStatus;
    gem: InvestmentSectionStatus;
    split: InvestmentSectionStatus;
  };
  incompleteScarabSlots: number[];
  incompleteCostLabels: string[];
  hasIncompleteCosts: boolean;
}

const positive = (value: number): boolean => Number.isFinite(value) && value > 0;
const touchedNumber = (value: number): boolean => Number.isFinite(value) && value !== 0;

const status = (configured: boolean, complete: boolean): InvestmentSectionStatus => {
  if (!configured) return 'empty';
  return complete ? 'filled' : 'incomplete';
};

/**
 * One definition for Advanced Costs pills, Investment/Dashboard warnings and
 * the Share gate. A selected item with a zero price is incomplete: the current
 * persisted shape cannot distinguish "free" from "not entered".
 */
export function investmentCompleteness(settings: SessionSettings): InvestmentCompleteness {
  const baseMap: InvestmentSectionStatus = positive(settings.baseMapCost) ? 'filled' : 'empty';

  const chiselConfigured = settings.chiselUsed
    || settings.chiselType.trim().length > 0
    || touchedNumber(settings.chiselPrice);
  const chisel = status(
    chiselConfigured,
    settings.chiselType.trim().length > 0 && positive(settings.chiselPrice),
  );

  const rollingPairs = [
    [settings.advExalt, settings.advExaltPrice],
    [settings.advScour, settings.advScourPrice],
    [settings.advAlch, settings.advAlchPrice],
  ] as const;
  const rollingConfigured = touchedNumber(settings.advChaos)
    || rollingPairs.some(([quantity, paid]) => touchedNumber(quantity) || touchedNumber(paid));
  const rollingComplete = positive(settings.advChaos)
    || rollingPairs.some(([quantity, paid]) => positive(quantity) && positive(paid));
  const rollingHasPartialPair = rollingPairs.some(([quantity, paid]) => (
    (touchedNumber(quantity) || touchedNumber(paid))
    && !(positive(quantity) && positive(paid))
  ));
  const rolling = status(rollingConfigured, rollingComplete && !rollingHasPartialPair);

  const deliriumConfigured = settings.advDeliOrbType.trim().length > 0
    || touchedNumber(settings.advDeliOrbQtyPerMap)
    || touchedNumber(settings.advDeliOrbPriceEach);
  const delirium = status(
    deliriumConfigured,
    settings.advDeliOrbType.trim().length > 0
      && positive(settings.advDeliOrbQtyPerMap)
      && positive(settings.advDeliOrbPriceEach),
  );

  const astrolabeConfigured = settings.advAstrolabeType.trim().length > 0
    || touchedNumber(settings.advAstrolabeCount)
    || touchedNumber(settings.advAstrolabePrice);
  const astrolabe = status(
    astrolabeConfigured,
    settings.advAstrolabeType.trim().length > 0
      && positive(settings.advAstrolabeCount)
      && positive(settings.advAstrolabePrice),
  );

  const gemConfigured = settings.advGemName.trim().length > 0
    || touchedNumber(settings.advGemCount)
    || touchedNumber(settings.advGemBuyPrice)
    || touchedNumber(settings.advGemSellPrice);
  const gem = status(
    gemConfigured,
    positive(settings.advGemCount)
      && positive(settings.advGemBuyPrice)
      && positive(settings.advGemSellPrice),
  );

  const split: InvestmentSectionStatus = positive(settings.advSplitPrice) ? 'filled' : 'empty';

  const incompleteScarabSlots = settings.scarabs.flatMap((scarab, index) => {
    const configured = scarab.name.trim().length > 0 || touchedNumber(scarab.cost);
    const complete = scarab.name.trim().length > 0 && positive(scarab.cost);
    return configured && !complete ? [index] : [];
  });

  const incompleteCostLabels: string[] = [];
  if (chisel === 'incomplete') incompleteCostLabels.push('Chisel');
  if (rolling === 'incomplete') incompleteCostLabels.push('Rolling costs');
  if (delirium === 'incomplete') incompleteCostLabels.push('Delirium Orbs');
  if (astrolabe === 'incomplete') incompleteCostLabels.push('Astrolabe');
  incompleteScarabSlots.forEach((index) => incompleteCostLabels.push(`Scarab ${index + 1}`));

  const sections = { baseMap, chisel, rolling, delirium, astrolabe, gem, split };

  return {
    sections,
    incompleteScarabSlots,
    incompleteCostLabels,
    hasIncompleteCosts: incompleteCostLabels.length > 0,
  };
}

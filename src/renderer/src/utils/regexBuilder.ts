import type { ModGroupState } from './regexBuilderPresets';

export const REGEX_CHAR_LIMIT = 250;
export const ALT_AUG_OPEN_SLOT_PATTERNS = ' Map \\(Tier|^Map of';

const combinations = <T>(values: T[], count: number): T[][] => {
  if (count === 0) return [[]];
  if (count > values.length) return [];
  const [head, ...tail] = values;
  return [
    ...combinations(tail, count - 1).map((combination) => [head, ...combination]),
    ...combinations(tail, count),
  ];
};

export const generatePosRegex = (tokens: string[], minimum: number): string => {
  if (tokens.length === 0 || minimum <= 0 || minimum > tokens.length) return '';
  if (minimum === 1) return `"${tokens.join('|')}"`;
  if (minimum === tokens.length) return tokens.map((token) => `"${token}"`).join(' ');

  const blockSize = tokens.length - minimum + 1;
  return combinations(tokens, blockSize)
    .map((combination) => `"${combination.join('|')}"`)
    .join(' ');
};

export interface GeneratedGroupRegex {
  id: string;
  label: string;
  selectedCount: number;
  minimum: number;
  blockCount: number;
  regex: string;
}

export interface GeneratedBuilderRegex {
  regex: string;
  charCount: number;
  blockCount: number;
  groups: GeneratedGroupRegex[];
}

export const generateBuilderRegex = (groups: ModGroupState[]): GeneratedBuilderRegex => {
  const generatedGroups = groups.flatMap<GeneratedGroupRegex>((group) => {
    const tokens = group.mods
      .filter((mod) => group.selected.includes(mod.id))
      .map((mod) => mod.token);
    const regex = generatePosRegex(tokens, group.k);
    if (!regex) return [];

    return [{
      id: group.id,
      label: group.label,
      selectedCount: tokens.length,
      minimum: group.k,
      blockCount: regex.split('" "').length,
      regex,
    }];
  });
  const regex = generatedGroups.map((group) => group.regex).join(' ');

  return {
    regex,
    charCount: regex.length,
    blockCount: generatedGroups.reduce((total, group) => total + group.blockCount, 0),
    groups: generatedGroups,
  };
};

const currencyNumberPattern = (minimum: number): string => {
  if (minimum <= 0) return '\\d..';
  const floor = Math.floor(minimum / 10) * 10;
  if (floor >= 200) return '[2-9]..';
  if (floor >= 100) {
    const tens = Math.floor((floor % 100) / 10);
    return tens === 0 ? '\\d..' : `1[${tens}-9].|[2-9]..`;
  }
  const tens = Math.floor(floor / 10);
  return tens >= 9 ? '9.|\\d..' : `[${tens}-9].|\\d..`;
};

const packSizeNumberPattern = (minimum: number): string => {
  if (minimum <= 0) return '\\d+';
  const tens = Math.floor(minimum / 10);
  return tens <= 0 ? '[1-9].|\\d..' : tens >= 9 ? '9.|\\d..' : `[${tens}-9].|\\d..`;
};

export interface AltAugSettings {
  currencyMin: number;
  packMin: number;
  gigaMin: number;
  chiseled: boolean;
}

export interface GeneratedAltAugRegex {
  regex: string;
  charCount: number;
}

export const generateAltAugRegex = ({
  currencyMin,
  packMin,
  gigaMin,
}: AltAugSettings): GeneratedAltAugRegex => {
  const currencyGate = `"curr.*(${currencyNumberPattern(currencyMin)})"`;
  const packGate =
    `"size.*(${packSizeNumberPattern(packMin)})%|${ALT_AUG_OPEN_SLOT_PATTERNS}` +
    `${gigaMin > currencyMin ? `|curr.*(${currencyNumberPattern(gigaMin)})` : ''}"`;
  const regex = `${currencyGate} ${packGate}`;
  return { regex, charCount: regex.length };
};

export const adjustAltAugChisel = (
  settings: AltAugSettings,
  chiseled: boolean,
): AltAugSettings => {
  if (settings.chiseled === chiseled) return settings;
  const adjustment = chiseled ? 50 : -50;
  return {
    ...settings,
    currencyMin: Math.max(0, settings.currencyMin + adjustment),
    gigaMin: Math.max(0, settings.gigaMin + adjustment),
    chiseled,
  };
};

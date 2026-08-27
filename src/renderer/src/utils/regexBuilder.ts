import type { ModGroupState } from './regexBuilderPresets';
import { exactIntegerThresholdPattern } from './regexThreshold';

export const REGEX_CHAR_LIMIT = 250;
export const OPEN_PREFIX_PATTERN = '^Map of';
export const OPEN_SUFFIX_PATTERN = 'Map \\(Tier';
export const OPEN_EITHER_PATTERN = `${OPEN_PREFIX_PATTERN}|${OPEN_SUFFIX_PATTERN}`;

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

export interface RegexGroupPreset {
  id: string;
  mods: { id: string }[];
}

export const findPresetIdForGroup = (
  group: ModGroupState,
  presets: RegexGroupPreset[],
): string | undefined => {
  const builtInIds = group.mods
    .filter((mod) => !mod.id.startsWith('custom_'))
    .map((mod) => mod.id);
  if (builtInIds.length === 0) return undefined;
  const builtInIdSet = new Set(builtInIds);
  return presets.find((preset) =>
    preset.mods.length === builtInIdSet.size &&
    preset.mods.every((mod) => builtInIdSet.has(mod.id)))?.id;
};

export const getAvailablePresetIds = (
  groups: ModGroupState[],
  presets: RegexGroupPreset[],
): string[] => {
  const used = new Set(
    groups
      .map((group) => findPresetIdForGroup(group, presets))
      .filter((id): id is string => id !== undefined),
  );
  return presets.map((preset) => preset.id).filter((id) => !used.has(id));
};

export type MagicMapNumericStat =
  | 'moreCurrency'
  | 'packSize'
  | 'quantity'
  | 'rarity'
  | 'moreMaps'
  | 'moreScarabs'
  | 'moreDivCards';

export const MAGIC_MAP_STAT_LABELS: Record<MagicMapNumericStat, string> = {
  moreCurrency: 'More Currency',
  packSize: 'Pack Size',
  quantity: 'Item Quantity',
  rarity: 'Item Rarity',
  moreMaps: 'More Maps',
  moreScarabs: 'More Scarabs',
  moreDivCards: 'More Divination Cards',
};

const MAGIC_MAP_STAT_ANCHORS: Record<MagicMapNumericStat, string> = {
  moreCurrency: 'curr',
  packSize: 'size',
  quantity: 'm q',
  rarity: 'm rar',
  moreMaps: 'maps',
  moreScarabs: 'scarabs',
  moreDivCards: 'divi',
};

export type MagicMapPredicate =
  | { kind: 'stat'; stat: MagicMapNumericStat; minimum: number }
  | { kind: 'token'; token: string }
  | { kind: 'open-affix'; side: 'prefix' | 'suffix' | 'either' };

export interface MagicMapChiselAdjustment {
  stat: MagicMapNumericStat;
  bonus: number;
  applied: boolean;
}

export interface MagicMapWorkflowSettings {
  required: MagicMapPredicate[];
  alternatives: MagicMapPredicate[];
  chisel?: MagicMapChiselAdjustment;
}

export interface GeneratedMagicMapRegex {
  regex: string;
  charCount: number;
  blockCount: number;
  invalidCount: number;
}

const normalizeDirectToken = (token: string): string | null => {
  const trimmed = token.trim();
  const withoutOuterQuotes = trimmed.startsWith('"') && trimmed.endsWith('"')
    ? trimmed.slice(1, -1).trim()
    : trimmed;
  return withoutOuterQuotes && !withoutOuterQuotes.includes('"') ? withoutOuterQuotes : null;
};

export const compileMagicMapPredicate = (
  predicate: MagicMapPredicate,
  chisel?: MagicMapChiselAdjustment,
): string | null => {
  if (predicate.kind === 'token') return normalizeDirectToken(predicate.token);
  if (predicate.kind === 'open-affix') {
    if (predicate.side === 'prefix') return OPEN_PREFIX_PATTERN;
    if (predicate.side === 'suffix') return OPEN_SUFFIX_PATTERN;
    return OPEN_EITHER_PATTERN;
  }
  if (!Number.isFinite(predicate.minimum) || predicate.minimum <= 0) return null;
  const appliedBonus = chisel && chisel.applied && chisel.stat === predicate.stat
    ? chisel.bonus
    : 0;
  const effectiveMinimum = Math.floor(predicate.minimum) + appliedBonus;
  return `${MAGIC_MAP_STAT_ANCHORS[predicate.stat]}.*(${exactIntegerThresholdPattern(effectiveMinimum)})%`;
};

export const generateMagicMapRegex = ({
  required,
  alternatives,
  chisel,
}: MagicMapWorkflowSettings): GeneratedMagicMapRegex => {
  const compiledRequired = required.map((predicate) => compileMagicMapPredicate(predicate, chisel));
  const compiledAlternatives = alternatives.map((predicate) => compileMagicMapPredicate(predicate, chisel));
  const requiredBlocks = compiledRequired
    .filter((predicate): predicate is string => predicate !== null && predicate !== '')
    .map((predicate) => `"${predicate}"`);
  const validAlternatives = compiledAlternatives
    .filter((predicate): predicate is string => predicate !== null && predicate !== '');
  const alternativeBlock = validAlternatives.length > 0
    ? [`"${validAlternatives.join('|')}"`]
    : [];
  const regex = [...requiredBlocks, ...alternativeBlock].join(' ');
  return {
    regex,
    charCount: regex.length,
    blockCount: requiredBlocks.length + alternativeBlock.length,
    invalidCount: [...compiledRequired, ...compiledAlternatives]
      .filter((predicate) => predicate === null).length,
  };
};

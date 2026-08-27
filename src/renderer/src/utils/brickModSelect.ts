import {
  brickExclusionMarker,
  normalizeBrickExclusionEntries,
} from '../../../shared/brickMods';

export type BrickModCatalogueContext = 'regular' | 'nightmare';

export interface BrickModSelectSource {
  id: string;
  label: string;
  summaryLabel?: string;
  regexTerm: string;
  tradeTexts: string[];
  displayText?: string;
  category: BrickModCatalogueContext;
  familyId?: string;
}

export interface BrickModSelectOption {
  value: string;
  /** Concise catalogue name; selected summaries may use summaryLabel instead. */
  label: string;
  /** Exact value-aware wording shown in the catalogue. */
  tradeLabel: string;
  /** Both names remain searchable even though only one is selected/displayed. */
  searchText: string;
  shared: boolean;
  familyId?: string;
}

const toOption = (mod: BrickModSelectSource): BrickModSelectOption => {
  const tradeLabel = mod.displayText ??
    (mod.tradeTexts.length > 0 ? mod.tradeTexts.join(' / ') : mod.label);
  return {
    value: mod.id,
    label: mod.label,
    tradeLabel,
    searchText: `${mod.label} ${tradeLabel}`,
    shared: !!mod.familyId,
    familyId: mod.familyId,
  };
};

/** Paired visible catalogues. Every semantic leaf appears only in its native
 * context; familyId supplies the cross-context relationship. */
export function buildBrickModCatalogues(mods: BrickModSelectSource[]): Record<
  BrickModCatalogueContext,
  BrickModSelectOption[]
> {
  return {
    regular: mods.filter((mod) => mod.category === 'regular').map(toOption),
    nightmare: mods.filter((mod) => mod.category === 'nightmare').map(toOption),
  };
}

export function selectedBrickIds(exclusions: readonly string[]): string[] {
  return normalizeBrickExclusionEntries(exclusions).selectedIds;
}

export function selectedBrickIdsForContext(
  mods: BrickModSelectSource[],
  exclusions: readonly string[],
  context: BrickModCatalogueContext,
): string[] {
  const selected = new Set(selectedBrickIds(exclusions));
  return mods
    .filter((mod) => mod.category === context && selected.has(mod.id))
    .map((mod) => mod.id);
}

/** Surface every sibling in an active linked family at the top. This keeps an
 * independently unchecked leaf beside its checked siblings until the entire
 * family is inactive, then canonical order returns automatically. */
export function prioritizeActiveFamilyOptions(
  options: readonly BrickModSelectOption[],
  allMods: readonly BrickModSelectSource[],
  selectedIdsValue: readonly string[],
): BrickModSelectOption[] {
  const selected = new Set(selectedIdsValue);
  const activeFamilies = new Set(allMods
    .filter((mod) => mod.familyId && selected.has(mod.id))
    .map((mod) => mod.familyId));
  const pinned = options.filter((option) =>
    option.familyId && activeFamilies.has(option.familyId));
  if (pinned.length === 0) return [...options];
  const pinnedIds = new Set(pinned.map((option) => option.value));
  return [...pinned, ...options.filter((option) => !pinnedIds.has(option.value))];
}

function entriesForSelection(
  mods: readonly BrickModSelectSource[],
  selected: ReadonlySet<string>,
  customTerms: readonly string[],
): string[] {
  const orderedKnown = mods.filter((mod) => selected.has(mod.id)).map((mod) => mod.id);
  const known = new Set(mods.map((mod) => mod.id));
  const unavailable = [...selected].filter((id) => !known.has(id));
  return [
    ...customTerms,
    ...[...orderedKnown, ...unavailable].map(brickExclusionMarker),
  ];
}

/** Every catalogue checkbox expresses only that exact semantic leaf. Related
 * families affect presentation (pinning/cues), never selection intent. */
export function toggleBrickExclusion(
  mods: BrickModSelectSource[],
  exclusions: readonly string[],
  id: string,
): string[] {
  const { selectedIds: currentIds, customTerms } = normalizeBrickExclusionEntries(exclusions);
  const selected = new Set(currentIds);
  const mod = mods.find((candidate) => candidate.id === id);
  if (!mod) return [...exclusions];

  if (selected.has(id)) selected.delete(id);
  else selected.add(id);

  return entriesForSelection(mods, selected, customTerms);
}
/** Shared-search matcher for one native catalogue. */
export function filterBrickModSelectOptions(
  options: BrickModSelectOption[],
  search: string,
): BrickModSelectOption[] {
  const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return options;
  const matches = (option: BrickModSelectOption): boolean =>
    words.every((word) => option.searchText.toLowerCase().includes(word));
  return options.filter(matches);
}

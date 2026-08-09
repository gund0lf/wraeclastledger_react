export interface BrickModSelectSource {
  id: string;
  label: string;
  tradeTexts: string[];
  category: 'regular' | 'nightmare';
}

export interface BrickModSelectOption {
  value: string;
  /** Compact catalogue name used by selected pills. */
  label: string;
  /** Exact normalized PoE Trade wording used in the dropdown. */
  tradeLabel: string;
  /** Both names remain searchable even though only one is selected/displayed. */
  searchText: string;
}

export interface BrickModSelectGroup {
  group: string;
  items: BrickModSelectOption[];
}

export function buildBrickModSelectGroups(mods: BrickModSelectSource[]): BrickModSelectGroup[] {
  const toOption = (mod: BrickModSelectSource): BrickModSelectOption => {
    const tradeLabel = mod.tradeTexts.length > 0 ? mod.tradeTexts.join(' / ') : mod.label;
    return {
      value: mod.id,
      label: mod.label,
      tradeLabel,
      searchText: `${mod.label} ${tradeLabel}`,
    };
  };
  const regular = mods.filter((mod) => mod.category === 'regular').map(toOption);
  const nightmare = mods.filter((mod) => mod.category === 'nightmare').map(toOption);
  const groups: BrickModSelectGroup[] = [];
  if (regular.length > 0) groups.push({ group: 'Regular / shared', items: regular });
  if (nightmare.length > 0) groups.push({ group: 'Nightmare', items: nightmare });
  return groups;
}

/** Mantine filter contract. Group structure is preserved while empty groups drop out. */
export function filterBrickModSelectOptions<T extends BrickModSelectOption | BrickModSelectGroup>(
  options: T[],
  search: string,
): T[] {
  const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return options;
  const matches = (option: BrickModSelectOption): boolean =>
    words.every((word) => option.searchText.toLowerCase().includes(word));
  return options.flatMap((option) => {
    if ('items' in option) {
      const items = option.items.filter(matches);
      return items.length > 0 ? [{ ...option, items } as T] : [];
    }
    return matches(option) ? [option] : [];
  });
}

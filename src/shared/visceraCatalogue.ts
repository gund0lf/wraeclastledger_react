// A modifier distinguishes market listings, but loot exports may carry only the item name.
export function visceraCatalogue(lines: readonly { name?: string; icon?: string }[]) {
  const art = new Map<string, string | null>();
  for (const { name, icon } of lines) {
    if (!name) continue;
    if (!art.has(name)) art.set(name, icon || null);
    else if (art.get(name) !== icon) art.set(name, null);
  }
  const icons: { name: string; icon: string }[] = [];
  for (const [name, icon] of art) {
    if (icon) icons.push({ name, icon });
  }
  return { names: [...art.keys()], icons, slugs: [], error: null };
}

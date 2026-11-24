/** Exchange lines quote one unit in the response's primary currency. The
 * volume and inverse rate fields describe different market observations. */
export function exchangeChaosPrices(data: {
  core?: { primary?: string };
  items?: { id?: string; name?: string }[];
  lines?: { id?: string; primaryValue?: number }[];
}): { name: string; chaos: number }[] {
  if (data.core?.primary !== 'chaos') return [];
  const names = new Map(data.items?.map(item => [item.id, item.name]));
  return (data.lines ?? []).flatMap(({ id, primaryValue }) => {
    const name = id && names.get(id);
    return name && typeof primaryValue === 'number' && Number.isFinite(primaryValue) && primaryValue > 0
      ? [{ name, chaos: primaryValue }] : [];
  });
}

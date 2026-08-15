const DAY_MS = 24 * 60 * 60 * 1000;

export const latestStrategyActivity = (
  postedAt: string,
  updatedAt: string | null | undefined,
  revision: number | null | undefined,
): { kind: 'Published' | 'Updated'; timestamp: string } =>
  (revision ?? 1) > 1 && updatedAt
    ? { kind: 'Updated', timestamp: updatedAt }
    : { kind: 'Published', timestamp: postedAt };

export const formatRelativeAge = (
  value: string | null | undefined,
  now = Date.now(),
): string => {
  if (!value) return '—';
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return '—';

  const days = Math.max(0, Math.floor((now - timestamp) / DAY_MS));
  if (days === 0) return 'Today';
  if (days === 1) return '1 day ago';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return '1 week ago';
  if (days < 21) return '2 weeks ago';
  if (days < 28) return '3 weeks ago';
  if (days < 60) return '1 month ago';

  const months = Math.floor(days / 30);
  if (days < 365) return `${months} months ago`;

  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? '' : 's'} ago`;
};

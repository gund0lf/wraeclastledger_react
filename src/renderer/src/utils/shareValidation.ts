export function hasImpossibleAtlasPoints(points: number | null, maximum: number | null): boolean {
  return points != null
    && maximum != null
    && Number.isFinite(points)
    && Number.isFinite(maximum)
    && maximum > 0
    && points > maximum;
}

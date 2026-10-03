/** Presentation of an already-recorded total; this never pools or reprices runs. */
export function recordedProfitPerMap(net: number | null | undefined, maps: number | null | undefined): number | null {
  return net != null && maps != null && maps > 0 ? net / maps : null
}

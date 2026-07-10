import { Text, Stack } from '@mantine/core'
import { CSSProperties, ReactNode } from 'react'
import { FONT } from '../../utils/uiTokens'
import { SectionLabel } from './SectionLabel'

/**
 * WP6.4 - label-over-value stat tile. A SectionLabel micro-label sits above a
 * value. Two grids share it:
 *  - StrategyCard's expanded stat grid: bare tiles, single primitive value,
 *    per-stat color.
 *  - Dashboard's Map Multipliers grid: boxed tiles whose value is an
 *    avg -> proj transition row (passed as a node).
 *
 * `value` mirrors ModuleHeader's `title` convention: a string/number is
 * wrapped in the standard tabular-nums stat Text (FONT.stat / fw 700 / the
 * given color); a node renders untouched so callers can supply richer content.
 * `boxed` toggles the bordered tile container (Dashboard) vs a bare Stack
 * (StrategyCard).
 */
export const StatTile = ({
  label,
  value,
  color,
  boxed = false,
  centered = false,
  labelStyle
}: {
  label: ReactNode
  value: ReactNode
  color?: string
  boxed?: boolean
  centered?: boolean
  labelStyle?: CSSProperties
}) => {
  const isPrimitive = typeof value === 'string' || typeof value === 'number'
  // `centered` centers the VALUE only — labels stay left-aligned, literally
  // matching the Dashboard's Map Multipliers tiles (Sad, 2026-07-09).
  const centerStyle: CSSProperties | undefined = centered ? { textAlign: 'center' } : undefined
  const body = (
    <>
      <SectionLabel style={labelStyle}>{label}</SectionLabel>
      {isPrimitive ? (
        <Text
          fw={700}
          style={{ fontSize: FONT.stat, color, fontVariantNumeric: 'tabular-nums', ...centerStyle }}
        >
          {value}
        </Text>
      ) : (
        value
      )}
    </>
  )
  return boxed ? (
    <div
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 6,
        padding: '4px 8px 6px',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      {body}
    </div>
  ) : (
    <Stack gap={0}>{body}</Stack>
  )
}

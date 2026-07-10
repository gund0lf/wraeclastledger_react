import { Text, TextProps } from '@mantine/core'
import { CSSProperties, ReactNode } from 'react'
import { COLOR, FONT } from '../../utils/uiTokens'

/**
 * WP6.4 — the uppercase, letterspaced micro-label used above stats and
 * sections. Single home for the pattern previously reimplemented inline
 * (fontSize 9 / color #555 / uppercase / letterSpacing 0.8) across
 * StrategyCard, Dashboard, ImportModal and others.
 */
export const SectionLabel = ({
  children,
  style,
  ...rest
}: TextProps & { children: ReactNode }) => (
  <Text
    style={{
      fontSize: FONT.label,
      color: COLOR.dim,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      ...(style as CSSProperties)
    }}
    {...rest}
  >
    {children}
  </Text>
)

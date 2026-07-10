import { Group, Text } from '@mantine/core'
import { ReactNode } from 'react'

/**
 * WP6.4 — the module title bar repeated at the top of Dashboard,
 * Strategy Browser, Notes, Atlas Calc and Session Log:
 *
 *   <Group justify="space-between" style={{ flexShrink: 0 }}>
 *     <Text fw={700} size="sm">{title}</Text>
 *     {right}
 *   </Group>
 *
 * `title` is a ReactNode so callers can interpolate counts or pair the
 * title with an inline badge (Notes' session badge, Session Log's count).
 * Pass a plain string for the common case and it's wrapped in the standard
 * bold title Text; pass your own nodes for anything richer.
 */
export const ModuleHeader = ({
  title,
  right,
  mb = 6
}: {
  title: ReactNode
  right?: ReactNode
  mb?: number | string
}) => (
  <Group justify="space-between" mb={mb} style={{ flexShrink: 0 }} wrap="nowrap">
    {typeof title === 'string' ? (
      <Text fw={700} size="sm">
        {title}
      </Text>
    ) : (
      title
    )}
    {right}
  </Group>
)

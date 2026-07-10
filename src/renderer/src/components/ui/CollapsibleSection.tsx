import { Stack, Group, Text, Badge, ActionIcon, Collapse } from '@mantine/core'
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react'
import { useState, ReactNode } from 'react'
import { FONT } from '../../utils/uiTokens'

/**
 * WP6.4 — shared collapsible section skeleton. Merges Dashboard's `Section`
 * and Investment's `AdvSection`. Owns the collapse state, the chevron and the
 * clickable header row; the two genuine visual forks are exposed as props:
 *
 *  - variant 'heading' — uppercase letterspaced section title (Dashboard).
 *    Supports a `right` slot for custom header controls.
 *  - variant 'group'   — plain bold form-group toggle in a dense stack
 *    (Investment advanced costs). Draws a bottom border and can show a
 *    "filled" badge when collapsed.
 */
export const CollapsibleSection = ({
  title,
  children,
  variant = 'heading',
  defaultOpen = variant === 'heading',
  right,
  filled = false
}: {
  title: string
  children: ReactNode
  variant?: 'heading' | 'group'
  defaultOpen?: boolean
  right?: ReactNode
  filled?: boolean
}) => {
  const [open, setOpen] = useState(defaultOpen)
  const toggle = () => setOpen((o) => !o)
  const isHeading = variant === 'heading'

  return (
    <Stack gap={0}>
      <Group
        justify="space-between"
        onClick={toggle}
        style={{
          cursor: 'pointer',
          padding: isHeading ? '5px 0' : '6px 0',
          borderBottom: isHeading ? undefined : '1px solid rgba(255,255,255,0.06)',
          userSelect: 'none'
        }}
      >
        <Group gap={6}>
          {isHeading ? (
            <Text
              size="xs"
              fw={700}
              c="dimmed"
              style={{ textTransform: 'uppercase', letterSpacing: 1, fontSize: FONT.small }}
            >
              {title}
            </Text>
          ) : (
            <Text size="xs" fw={700}>
              {title}
            </Text>
          )}
          {!isHeading && filled && !open && (
            <Badge size="xs" color="green" variant="dot">
              filled
            </Badge>
          )}
        </Group>
        <Group gap={6} onClick={(e) => e.stopPropagation()}>
          {right}
          <ActionIcon size="xs" variant="transparent" c="dimmed" onClick={toggle}>
            {open ? <IconChevronDown size={10} /> : <IconChevronRight size={10} />}
          </ActionIcon>
        </Group>
      </Group>
      <Collapse in={open}>
        {isHeading ? (
          <div style={{ paddingBottom: 6 }}>{children}</div>
        ) : (
          <Stack gap="xs" pt="xs" pb={4}>
            {children}
          </Stack>
        )}
      </Collapse>
    </Stack>
  )
}

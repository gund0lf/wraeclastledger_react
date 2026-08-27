import { Group, Text, Badge, ActionIcon, CopyButton, Tooltip } from '@mantine/core'
import { IconCopy, IconCheck } from '@tabler/icons-react'
import { FONT } from '../../utils/uiTokens'

/**
 * WP6.4 — small copy-to-clipboard affordance for regex strings.
 * Moved here verbatim from StrategyCard (which re-exports it for
 * backwards compatibility).
 */
export const CopyRegex = ({ value, label, disabled = false }: { value: string; label: string; disabled?: boolean }) => (
  <CopyButton value={value} timeout={2000}>
    {({ copied, copy }) => (
      <ActionIcon size="md" variant={copied ? 'light' : 'default'} color={copied ? 'teal' : undefined}
        disabled={disabled} onClick={disabled ? undefined : copy}
        aria-label={`Copy ${label} regex`}
        title={disabled ? 'Regex exceeds the 250-character stash limit' : copied ? 'Copied!' : `Copy ${label} regex`}>
        {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
      </ActionIcon>
    )}
  </CopyButton>
)

/**
 * WP6.4 — one monospace regex line with an optional role badge and a copy
 * button. Replaces the hand-rolled Badge+Text+CopyRegex rows in StrategyCard
 * and ImportModal.
 */
export const RegexLine = ({
  value,
  badge,
  badgeColor = 'gray',
  badgeTooltip,
  c = 'teal',
  charLimit,
}: {
  value: string
  badge?: string
  badgeColor?: string
  badgeTooltip?: string
  c?: string
  charLimit?: number
}) => (
  // session-16: align center (the md copy button made top-aligned badges/text
  // look displaced against the taller row)
  <Group gap={4} wrap="nowrap" align="center">
    {badge && (
      // Fixed width so paired Run/Slam lines start their regex text at the
      // same offset regardless of badge label length (Sad, 2026-07-09).
      <Tooltip label={badgeTooltip} withArrow multiline w={260} disabled={!badgeTooltip}>
        <Badge size="xs" color={badgeColor} variant="light" w={44}
          style={{ flexShrink: 0, cursor: badgeTooltip ? 'help' : undefined }}>
          {badge}
        </Badge>
      </Tooltip>
    )}
    <Text size="xs" c={c} style={{ fontFamily: 'monospace', fontSize: FONT.small, flex: 1, wordBreak: 'break-all' }}>
      {value}
    </Text>
    {charLimit !== undefined && (
      <Badge size="xs" variant="light"
        color={value.length > charLimit ? 'red' : value.length > 220 ? 'yellow' : 'green'}
        style={{ flexShrink: 0 }}>
        {value.length} / {charLimit}
      </Badge>
    )}
    <CopyRegex value={value} label={(badge ?? 'this').toLowerCase()}
      disabled={charLimit !== undefined && value.length > charLimit} />
  </Group>
)

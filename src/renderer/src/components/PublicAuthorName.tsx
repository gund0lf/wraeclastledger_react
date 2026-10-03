import { Text, Tooltip } from '@mantine/core'
import type { SafeRow } from '../../../shared/safeStrategy'
import { ANONYMOUS_AUTHOR_TOOLTIP, hasPublicAuthorName, safeAuthorLabel } from '../utils/safeStrategyPresentation'

/** Display only; never collapse registration state or infer ownership from text. */
export function PublicAuthorName({ attribution, compact = false }: { attribution: SafeRow['attribution']; compact?: boolean }) {
  const named = hasPublicAuthorName(attribution), label = safeAuthorLabel(attribution)
  return <Tooltip withArrow label={named ? label : ANONYMOUS_AUTHOR_TOOLTIP}>
    <Text span c="dimmed" fs={named ? undefined : 'italic'} fw={named ? 600 : undefined}
      title={named ? label : ANONYMOUS_AUTHOR_TOOLTIP}
      aria-label={named ? label : `Anonymous — ${ANONYMOUS_AUTHOR_TOOLTIP}`}
      style={{ fontSize: 'inherit', ...(compact ? { display: 'block', minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } : { overflowWrap: 'anywhere' }) }}>
      {label}
    </Text>
  </Tooltip>
}

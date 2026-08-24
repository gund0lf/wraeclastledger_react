import { Stack, Group, Text, ActionIcon, Tooltip } from '@mantine/core'
import { IconX, IconListNumbers } from '@tabler/icons-react'
import { COLOR, FONT } from '../utils/uiTokens'

// WP7: first-run onboarding. A dismissible "Getting started" banner shown at the
// top of the Dashboard while the session is completely empty (no maps, no loot)
// and the user hasn't dismissed it. Dismissal is persisted top-level in the
// store so it never reappears once closed.
const STEPS: string[] = [
  'Turn on Capture in the Map Log panel.',
  'Copy a map before running it; after finishing, copy the next map. Each capture logs automatically.',
  'Set your costs in the Investment panel (scarabs, chisels, orbs).',
  'Import a WealthyExile stash CSV as your baseline before mapping.',
  'Run your maps.',
  'Import the return CSV afterwards to see your profit.'
]

// "Good to know" footer: onboarding mentions that don't fit the numbered
// loop. Auto-save/fork explains the repository identity model; Atlas Bonus =
// discoverability for the pill inside the collapsed "Click to edit" section.
const GOOD_TO_KNOW: string[] = [
  'Pace uses the time between captures. For pre-imported batches, use the optional manual timer in Run Statistics instead.',
  'Loaded sessions auto-save as you edit - use Duplicate as new in Sessions to fork before experimenting.',
  'Completed all 100 Atlas objectives? Toggle Atlas Bonus in the Multiplier panel - it starts off each new league.'
]

export const GettingStartedCard = ({ onDismiss }: { onDismiss: () => void }) => (
  <Stack
    gap={6}
    mb={6}
    p="xs"
    style={{
      background: 'rgba(77,171,247,0.07)',
      border: '1px solid rgba(77,171,247,0.25)',
      borderRadius: 6,
      flexShrink: 0
    }}
  >
    <Group justify="space-between" align="center" wrap="nowrap">
      <Group gap={6} wrap="nowrap">
        <IconListNumbers size={14} style={{ color: COLOR.accent }} />
        <Text size="xs" fw={700} c="blue">Getting started</Text>
      </Group>
      <Tooltip label="Dismiss">
        <ActionIcon size="xs" variant="subtle" color="gray" onClick={onDismiss}>
          <IconX size={12} />
        </ActionIcon>
      </Tooltip>
    </Group>
    <Text size="xs" c="dimmed" style={{ fontSize: FONT.small }}>
      Track a mapping session&apos;s profit in six steps:
    </Text>
    <Stack gap={3}>
      {STEPS.map((step, i) => (
        <Group key={i} gap={6} wrap="nowrap" align="flex-start">
          <Text
            size="xs"
            fw={700}
            c="blue"
            style={{ fontSize: FONT.small, lineHeight: 1.4, minWidth: 14, textAlign: 'right' }}
          >
            {i + 1}.
          </Text>
          <Text size="xs" c="dimmed" style={{ fontSize: FONT.small, lineHeight: 1.4 }}>
            {step}
          </Text>
        </Group>
      ))}
    </Stack>
    <Stack gap={2} pt={2} style={{ borderTop: '1px solid rgba(77,171,247,0.15)' }}>
      {GOOD_TO_KNOW.map((note, i) => (
        <Group key={i} gap={6} wrap="nowrap" align="flex-start">
          <Text size="xs" c="blue" style={{ fontSize: FONT.small, lineHeight: 1.4, minWidth: 14, textAlign: 'right' }}>
            {'\u2022'}
          </Text>
          <Text size="xs" c="dimmed" style={{ fontSize: FONT.small, lineHeight: 1.4 }}>
            {note}
          </Text>
        </Group>
      ))}
    </Stack>
  </Stack>
)

import { SegmentedControl, Stack, Text, Tooltip } from '@mantine/core';
import {
  hasDivinePrice,
  lootCurrencyPresentation,
  normalizeLootCurrencyMode,
  type LootCurrencyMode,
} from '../../utils/currencyDisplay';
import { COLOR, FONT } from '../../utils/uiTokens';

interface LootCurrencyProps {
  chaosValue: number | null | undefined;
  divinePrice: number | null | undefined;
  mode: LootCurrencyMode;
  signed?: boolean;
  color?: string;
  align?: 'left' | 'right';
}

const tooltipLabel = (
  chaosValue: number | null | undefined,
  divinePrice: number | null | undefined,
  mode: LootCurrencyMode,
  signed = false,
): string | null => {
  const display = lootCurrencyPresentation(chaosValue, divinePrice, mode, { sign: signed });
  if (display.divine === null || !hasDivinePrice(divinePrice)) return null;
  return `${display.chaos} \u00b7 ${display.divine} at ${divinePrice.toLocaleString('en-US')}c per Divine`;
};

export const LootCurrencyValue = ({
  chaosValue,
  divinePrice,
  mode,
  signed = false,
  color,
  align = 'right',
}: LootCurrencyProps) => {
  const display = lootCurrencyPresentation(chaosValue, divinePrice, mode, { sign: signed });
  const label = tooltipLabel(chaosValue, divinePrice, mode, signed);
  return (
    <Tooltip label={label} disabled={label === null} withArrow>
      <Text
        component="span"
        fw={700}
        ta={align}
        style={{
          display: 'inline-block',
          color,
          fontSize: FONT.body,
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
          cursor: label === null ? undefined : 'help',
        }}
      >
        {display.primary}
      </Text>
    </Tooltip>
  );
};

export const LootCurrencyPair = ({
  chaosValue,
  divinePrice,
  mode,
  signed = false,
  color,
  align = 'right',
}: LootCurrencyProps) => {
  const display = lootCurrencyPresentation(chaosValue, divinePrice, mode, { sign: signed });
  const label = tooltipLabel(chaosValue, divinePrice, mode, signed);
  return (
    <Tooltip label={label} disabled={label === null} withArrow>
      <Stack gap={0} align={align === 'right' ? 'flex-end' : 'flex-start'} style={{ minWidth: 0 }}>
        <Text fw={800} ta={align} style={{ color, fontSize: FONT.md, fontVariantNumeric: 'tabular-nums', lineHeight: 1.15, whiteSpace: 'nowrap' }}>
          {display.primary}
        </Text>
        {display.secondary !== null && (
          <Text ta={align} style={{ color: COLOR.textFaint, fontSize: FONT.label, fontVariantNumeric: 'tabular-nums', lineHeight: 1.15, whiteSpace: 'nowrap', cursor: 'help' }}>
            {display.secondary}
          </Text>
        )}
      </Stack>
    </Tooltip>
  );
};

export const LootCurrencyToggle = ({
  mode,
  onChange,
  divineAvailable,
  compact = false,
  unavailableReason = 'A Divine equivalent needs one authored Divine-price snapshot.',
}: {
  mode: LootCurrencyMode;
  onChange: (mode: LootCurrencyMode) => void;
  divineAvailable: boolean;
  compact?: boolean;
  unavailableReason?: string;
}) => {
  const control = (
    <SegmentedControl
      aria-label="Loot value display currency"
      size="xs"
      value={divineAvailable ? mode : 'chaos'}
      onChange={(value) => onChange(normalizeLootCurrencyMode(value))}
      data={[
        { value: 'chaos', label: compact ? 'C' : 'Chaos' },
        { value: 'divine', label: compact ? 'D' : 'Divine', disabled: !divineAvailable },
      ]}
      styles={{
        root: { flexShrink: 0 },
        label: { paddingInline: compact ? 6 : 8, fontSize: FONT.small },
      }}
    />
  );
  return divineAvailable ? (
    compact ? (
      <Tooltip label="Display loot values in Chaos or Divine Orbs" withArrow>
        <div style={{ display: 'inline-flex' }}>{control}</div>
      </Tooltip>
    ) : control
  ) : (
    <Tooltip label={unavailableReason} withArrow multiline w={250}>
      <div style={{ display: 'inline-flex' }}>{control}</div>
    </Tooltip>
  );
};

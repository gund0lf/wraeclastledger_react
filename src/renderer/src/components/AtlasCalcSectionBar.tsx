import { Text, UnstyledButton } from '@mantine/core';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { COLOR } from '../utils/uiTokens';

export const AtlasCalcSectionBar = ({ title, meta, open, onClick }: {
  title: string;
  meta: string;
  open: boolean;
  onClick: () => void;
}) => (
  <UnstyledButton
    className="atlas-calc-section-bar"
    data-open={open}
    onClick={onClick}
    aria-expanded={open}
  >
    {open
      ? <IconChevronDown size={12} color={COLOR.textMuted} />
      : <IconChevronRight size={12} color={COLOR.textMuted} />}
    <Text size="xs" fw={600} className="atlas-calc-section-title">{title}</Text>
    <div className="atlas-calc-section-meta">
      <Text component="span" size="xs" c="dimmed" className="atlas-calc-section-meta-text">
        {meta}
      </Text>
    </div>
  </UnstyledButton>
);

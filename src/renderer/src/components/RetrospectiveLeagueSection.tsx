import { Badge, Card, Text } from '@mantine/core';
import type { ReactNode } from 'react';

export function RetrospectiveLeagueSection({ league, countLabel, newest, children }: {
  league: string;
  countLabel: string;
  newest: boolean;
  children: ReactNode;
}) {
  return (
    <Card component="details" open={newest} padding="xs" radius="sm" withBorder>
      <summary style={{ cursor: 'pointer' }}>
        <Text component="span" size="sm" fw={700}>{league}</Text>
        <Badge size="xs" ml="xs" variant="light">{countLabel}</Badge>
      </summary>
      {children}
    </Card>
  );
}

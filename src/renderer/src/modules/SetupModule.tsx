import { Card, Stack } from '@mantine/core';
import { CollapsibleSection } from '../components/ui/CollapsibleSection';
import { SessionManagerModule } from './SessionManagerModule';
import { AtlasCalcModule } from './AtlasCalcModule';
import { InvestmentModule } from './InvestmentModule';

/**
 * Compact home for the three setup-oriented tools. The FlexLayout left border
 * owns the expand/collapse interaction; these sections keep each familiar
 * panel available without rearranging its controls.
 */
export const SetupModule = () => (
  <Card
    shadow="sm"
    padding="sm"
    radius="md"
    withBorder
    h="100%"
    style={{ overflow: 'auto', scrollbarGutter: 'stable' }}
  >
    <Stack gap="xs">
      <CollapsibleSection title="Sessions">
        <SessionManagerModule embedded />
      </CollapsibleSection>
      <CollapsibleSection title="Atlas Calc">
        <AtlasCalcModule embedded />
      </CollapsibleSection>
      <CollapsibleSection title="Investment">
        <InvestmentModule embedded />
      </CollapsibleSection>
    </Stack>
  </Card>
);

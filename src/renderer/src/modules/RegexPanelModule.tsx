/**
 * RegexPanelModule — WP8 merged Regex panel.
 *
 * Combines the former Regex and Regex Builder panels into one tabbed surface:
 *   From Session  → FromSessionTab   (RegexModule.tsx)   — generate/exclusions/trade
 *   Builder       → BuilderTab       (RegexBuilderModule.tsx) — K-of-N POS builder
 *   Saved Sets    → SavedSetsTab     (RegexModule.tsx)   — shared saved-set list
 *
 * Both legacy registry ids map here (see layout/Registry.tsx):
 *   'regex'         → <RegexPanel/>        (opens on From Session)
 *   'regex-builder' → <RegexBuilderPanel/> (opens on Builder)
 * so old saved layouts that still reference 'regex-builder' keep working.
 *
 * keepMounted: all three tabs stay mounted so switching tabs preserves
 * FromSessionTab local state (trade-modal inputs, paste preview) and avoids
 * re-firing the brickMods IPC fetch. Inactive panels get the [hidden] attribute
 * (UA display:none); the active panel's inline flexGrow makes it fill the Card.
 */

import { Card, Tabs, Badge, Tooltip, ActionIcon, Group } from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import { useState } from 'react';
import { useSessionKeys } from '../store/useSessionStore';
import { FromSessionTab, SavedSetsTab } from './RegexModule';
import { BuilderTab } from './RegexBuilderModule';

type TabKey = 'session' | 'builder' | 'saved';

const PANEL_STYLE = { flexGrow: 1, minHeight: 0, overflow: 'hidden' } as const;

const RegexPanelModule = ({ initialTab = 'session' }: { initialTab?: TabKey }) => {
  const [tab, setTab] = useState<string>(initialTab);
  // Default-exclusions badge lives in the tab bar (Sad 2026-07-09): it is
  // user-scoped panel state, the spot is otherwise dead space, and it no
  // longer pushes the From Session content down. × clears the default.
  const { defaultExclusionPreset, clearDefaultPreset } =
    useSessionKeys('defaultExclusionPreset', 'clearDefaultPreset');

  return (
    <Card
      shadow="sm"
      padding={0}
      radius="md"
      withBorder
      h="100%"
      style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
    >
      <Tabs
        value={tab}
        onChange={(v) => setTab(v ?? 'session')}
        keepMounted
        variant="outline"
        style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, minHeight: 0 }}
      >
        <Tabs.List style={{ flexShrink: 0 }}>
          <Tabs.Tab value="session">From Session</Tabs.Tab>
          <Tabs.Tab value="builder">Builder</Tabs.Tab>
          <Tabs.Tab value="saved">Saved Sets</Tabs.Tab>
          {defaultExclusionPreset.length > 0 && (
            <Group ml="auto" pr={8} style={{ alignSelf: 'center' }}>
              <Tooltip withArrow multiline w={260}
                label={`Default exclusions (auto-applied when you load a strategy): ${defaultExclusionPreset.map((t) => `!${t}`).join(' ')}`}>
                <Badge size="sm" color="teal" variant="dot" style={{ cursor: 'default' }}
                  rightSection={
                    <ActionIcon size={16} variant="transparent" color="teal" aria-label="Clear default exclusions"
                      onClick={clearDefaultPreset} style={{ marginLeft: 2 }}>
                      <IconX size={12} />
                    </ActionIcon>
                  }>
                  Default set
                </Badge>
              </Tooltip>
            </Group>
          )}
        </Tabs.List>

        <Tabs.Panel value="session" style={PANEL_STYLE}>
          <FromSessionTab />
        </Tabs.Panel>
        <Tabs.Panel value="builder" style={PANEL_STYLE}>
          <BuilderTab />
        </Tabs.Panel>
        <Tabs.Panel value="saved" style={PANEL_STYLE}>
          <SavedSetsTab />
        </Tabs.Panel>
      </Tabs>
    </Card>
  );
};

// Registry wrappers — one component, two entry points into different tabs.
export const RegexPanel = () => <RegexPanelModule initialTab="session" />;
export const RegexBuilderPanel = () => <RegexPanelModule initialTab="builder" />;

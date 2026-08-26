/**
 * WP8 merged Regex panel: From Session owns generated output, exclusions,
 * presets, and Trade; Builder owns the explicit Any/All/K-of-N workspace.
 * Both legacy registry ids still map here so old saved layouts survive.
 * Tabs stay mounted to preserve Trade inputs and avoid refetching brick data.
 */

import { Tabs, Badge, Tooltip, ActionIcon, Group } from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import { useState } from 'react';
import { useSessionKeys } from '../store/useSessionStore';
import { FromSessionTab } from './RegexModule';
import { BuilderTab } from './RegexBuilderModule';
import './RegexPanelModule.css';

type TabKey = 'session' | 'builder';

const PANEL_STYLE = { flexGrow: 1, minHeight: 0, overflow: 'hidden' } as const;

const RegexPanelModule = ({ initialTab = 'session' }: { initialTab?: TabKey }) => {
  const [tab, setTab] = useState<string>(initialTab);
  // Default-exclusions badge lives in the tab bar (Sad 2026-07-09): it is
  // user-scoped panel state, the spot is otherwise dead space, and it no
  // longer pushes the From Session content down. The close action clears it.
  const { defaultExclusionPreset, clearDefaultPreset } =
    useSessionKeys('defaultExclusionPreset', 'clearDefaultPreset');

  return (
    <div className="regex-panel-root">
      <Tabs
        className="regex-panel-tabs"
        value={tab}
        onChange={(v) => setTab(v ?? 'session')}
        keepMounted
        variant="outline"
        style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, minHeight: 0 }}
      >
        <Tabs.List className="regex-panel-tab-list">
          <Tabs.Tab value="session">From Session</Tabs.Tab>
          <Tabs.Tab value="builder">Builder</Tabs.Tab>
          {defaultExclusionPreset.length > 0 && (
            <Group ml="auto" pr={8} style={{ alignSelf: 'center' }}>
              <Tooltip withArrow multiline w={260}
                label={`Default exclusions (auto-applied when you load a strategy): ${defaultExclusionPreset.map((t) => `!${t}`).join(' ')}`}>
                <Badge size="sm" color="teal" variant="dot" style={{ cursor: 'default' }}
                  rightSection={
                    // Destructive control stays neutral until direct hover.
                    <ActionIcon size={16} variant="transparent"
                      className="regex-destructive-icon"
                      color="gray"
                      aria-label="Clear default exclusions"
                      onClick={clearDefaultPreset}
                      style={{ marginLeft: 2 }}>
                      <IconX size={12} />
                    </ActionIcon>
                  }>
                  Default set
                </Badge>
              </Tooltip>
            </Group>
          )}
        </Tabs.List>

        <Tabs.Panel className="regex-panel-tab" value="session" style={PANEL_STYLE}>
          <FromSessionTab />
        </Tabs.Panel>
        <Tabs.Panel className="regex-panel-tab" value="builder" style={PANEL_STYLE}>
          <BuilderTab />
        </Tabs.Panel>
      </Tabs>
    </div>
  );
};

// Registry wrappers — one component, two entry points into different tabs.
export const RegexPanel = () => <RegexPanelModule initialTab="session" />;
export const RegexBuilderPanel = () => <RegexPanelModule initialTab="builder" />;

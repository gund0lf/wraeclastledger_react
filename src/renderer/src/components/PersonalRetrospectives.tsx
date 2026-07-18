import {
  ActionIcon, Alert, Badge, Button, Card, Group, Modal, Select, Stack, Text,
  TextInput, Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconArchive, IconArrowsLeftRight, IconFolderOpen, IconRotateClockwise,
} from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { useSessionKeys } from '../store/useSessionStore';
import { LEAGUE_ENDS_AT } from '../utils/league';
import {
  buildPersonalRetrospectiveGroups,
  collectPersonalLeagueCandidates,
  localDateTimeInputToUtcIso,
  normalizeLeagueKey,
  utcIsoToLocalDateTimeInput,
} from '../utils/retrospectives';
import { CollapsibleSection } from './ui/CollapsibleSection';
import { SessionCompareModal } from './SessionCompareModal';

interface Props {
  onLoadSession: (id: string) => void;
}

function displayUtc(iso: string): string {
  const date = new Date(iso);
  return Number.isFinite(date.getTime())
    ? `${date.toLocaleString()} (${iso})`
    : iso;
}

export const PersonalRetrospectives = ({ onLoadSession }: Props) => {
  const {
    savedSessions,
    retrospectiveCloseouts,
    setPersonalLeagueCloseout,
    removePersonalLeagueCloseout,
  } = useSessionKeys(
    'savedSessions',
    'retrospectiveCloseouts',
    'setPersonalLeagueCloseout',
    'removePersonalLeagueCloseout',
  );

  const [closeoutOpen, { open: openCloseoutModal, close: closeCloseoutModal }] = useDisclosure(false);
  const [compareOpen, { open: openCompare, close: closeCompare }] = useDisclosure(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [selectedLeague, setSelectedLeague] = useState('');
  const [cutoffLocal, setCutoffLocal] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const candidates = useMemo(
    () => collectPersonalLeagueCandidates(savedSessions),
    [savedSessions],
  );
  const groups = useMemo(
    () => buildPersonalRetrospectiveGroups(savedSessions, retrospectiveCloseouts),
    [savedSessions, retrospectiveCloseouts],
  );
  const includedCount = groups.reduce((sum, group) => sum + group.sessions.length, 0);

  const cutoffForLeague = (leagueName: string): string => {
    const key = normalizeLeagueKey(leagueName);
    const existing = retrospectiveCloseouts[key]?.cutoffUtc;
    if (existing) return existing;
    const knownEnd = Object.entries(LEAGUE_ENDS_AT)
      .find(([knownLeague]) => normalizeLeagueKey(knownLeague) === key)?.[1];
    if (knownEnd) return knownEnd;
    const candidate = candidates.find((entry) => entry.leagueKey === key);
    return new Date(candidate?.latestActivityAt ?? Date.now()).toISOString();
  };

  const beginCloseout = (leagueName?: string) => {
    const nextLeague = leagueName ?? candidates[0]?.leagueName ?? '';
    setSelectedLeague(nextLeague);
    setCutoffLocal(nextLeague ? utcIsoToLocalDateTimeInput(cutoffForLeague(nextLeague)) : '');
    setFormError(null);
    openCloseoutModal();
  };

  const changeLeague = (leagueName: string | null) => {
    const nextLeague = leagueName ?? '';
    setSelectedLeague(nextLeague);
    setCutoffLocal(nextLeague ? utcIsoToLocalDateTimeInput(cutoffForLeague(nextLeague)) : '');
    setFormError(null);
  };

  const submitCloseout = () => {
    const cutoffUtc = localDateTimeInputToUtcIso(cutoffLocal);
    if (!selectedLeague || !cutoffUtc) {
      setFormError('Choose a league and a valid cutoff date and time.');
      return;
    }
    try {
      setPersonalLeagueCloseout(selectedLeague, cutoffUtc);
      closeCloseoutModal();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not close out this league.');
    }
  };

  const openLeagueCompare = (ids: string[]) => {
    setCompareIds(ids.slice(0, 3));
    openCompare();
  };

  const cutoffPreview = localDateTimeInputToUtcIso(cutoffLocal);

  return (
    <>
      <Modal
        opened={closeoutOpen}
        onClose={closeCloseoutModal}
        title={selectedLeague ? `Close out ${selectedLeague}` : 'Close out league'}
        size="sm"
      >
        <Stack gap="sm">
          <Text size="xs" c="dimmed">
            This creates a local Personal retrospective. Sessions after the cutoff are omitted.
            Public frozen boards appear separately once their operator snapshot is published.
          </Text>
          <Select
            label="League"
            data={candidates.map((candidate) => ({
              value: candidate.leagueName,
              label: `${candidate.leagueName} (${candidate.sessionCount} session${candidate.sessionCount === 1 ? '' : 's'})`,
            }))}
            value={selectedLeague}
            onChange={changeLeague}
            allowDeselect={false}
          />
          <TextInput
            label="Cutoff date and time"
            type="datetime-local"
            value={cutoffLocal}
            onChange={(event) => {
              setCutoffLocal(event.currentTarget.value);
              setFormError(null);
            }}
          />
          <Text size="xs" c="dimmed">
            UTC: {cutoffPreview ?? 'Choose a valid date and time'}
          </Text>
          {formError && <Alert color="red" variant="light">{formError}</Alert>}
          <Group justify="flex-end" gap="xs">
            <Button size="xs" variant="default" onClick={closeCloseoutModal}>Cancel</Button>
            <Button size="xs" leftSection={<IconArchive size={13} />} onClick={submitCloseout}>
              {retrospectiveCloseouts[normalizeLeagueKey(selectedLeague)]
                ? `Update ${selectedLeague} cutoff`
                : `Close out ${selectedLeague || 'league'}`}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <SessionCompareModal
        opened={compareOpen}
        onClose={closeCompare}
        initialSelectedIds={compareIds}
      />

      <Stack gap="sm">
        <Group justify="space-between" align="flex-start">
          <div>
            <Text size="sm" fw={700}>End-of-league retrospectives</Text>
            <Text size="xs" c="dimmed">
              Review your saved sessions by league. Published frozen rankings appear separately below.
            </Text>
          </div>
          <Button
            size="xs"
            variant="default"
            leftSection={<IconArchive size={13} />}
            disabled={candidates.length === 0}
            onClick={() => beginCloseout()}
          >
            Close out league
          </Button>
        </Group>

        {candidates.length === 0 ? (
          <Alert color="gray" variant="light">
            Save a session with a supported league before creating a retrospective.
          </Alert>
        ) : groups.length === 0 ? (
          <Alert color="blue" variant="light">
            Choose Close out league to create your first Personal retrospective.
          </Alert>
        ) : (
          <CollapsibleSection
            title={`Personal · ${includedCount} session${includedCount === 1 ? '' : 's'}`}
            defaultOpen={false}
          >
            <Stack gap="xs">
              {groups.map((group) => (
                <Card key={group.leagueKey} padding="xs" radius="sm" withBorder>
                  <Stack gap={6}>
                    <Group justify="space-between" align="flex-start" wrap="nowrap">
                      <div>
                        <Group gap={6}>
                          <Text size="xs" fw={700}>{group.leagueName}</Text>
                          <Badge size="xs" variant="light">
                            {group.sessions.length} session{group.sessions.length === 1 ? '' : 's'}
                          </Badge>
                        </Group>
                        <Tooltip label={displayUtc(group.cutoffUtc)} withArrow>
                          <Text size="xs" c="dimmed" style={{ cursor: 'help' }}>
                            Cutoff {new Date(group.cutoffUtc).toLocaleString()}
                          </Text>
                        </Tooltip>
                      </div>
                      <Group gap={4} wrap="nowrap">
                        {group.sessions.length >= 2 && (
                          <Tooltip label="Compare sessions from this league" withArrow>
                            <ActionIcon
                              size="sm"
                              variant="default"
                              aria-label={`Compare ${group.leagueName} sessions`}
                              onClick={() => openLeagueCompare(group.sessions.map((session) => session.id))}
                            >
                              <IconArrowsLeftRight size={12} />
                            </ActionIcon>
                          </Tooltip>
                        )}
                        <Button size="compact-xs" variant="subtle" onClick={() => beginCloseout(group.leagueName)}>
                          Edit cutoff
                        </Button>
                        <Tooltip label="Remove this local close-out marker" withArrow>
                          <ActionIcon
                            size="sm"
                            variant="subtle"
                            color="gray"
                            aria-label={`Reopen ${group.leagueName}`}
                            onClick={() => removePersonalLeagueCloseout(group.leagueName)}
                          >
                            <IconRotateClockwise size={12} />
                          </ActionIcon>
                        </Tooltip>
                      </Group>
                    </Group>

                    {(group.omittedAfterCutoff > 0 || group.omittedUndated > 0) && (
                      <Text size="xs" c="dimmed">
                        {group.omittedAfterCutoff > 0
                          ? `${group.omittedAfterCutoff} after-cutoff session${group.omittedAfterCutoff === 1 ? '' : 's'} omitted`
                          : ''}
                        {group.omittedAfterCutoff > 0 && group.omittedUndated > 0 ? ' · ' : ''}
                        {group.omittedUndated > 0
                          ? `${group.omittedUndated} undated session${group.omittedUndated === 1 ? '' : 's'} omitted`
                          : ''}
                      </Text>
                    )}

                    {group.sessions.length === 0 ? (
                      <Text size="xs" c="dimmed">No sessions fall on or before this cutoff.</Text>
                    ) : (
                      <Stack gap={3}>
                        {group.sessions.map((session) => (
                          <Group key={session.id} justify="space-between" wrap="nowrap">
                            <div style={{ minWidth: 0 }}>
                              <Text size="xs" truncate>{session.name}</Text>
                              <Text size="xs" c="dimmed">
                                {session.maps.length} maps · {new Date(session.createdAt).toLocaleDateString()}
                              </Text>
                            </div>
                            <Tooltip label="Load this saved session" withArrow>
                              <ActionIcon
                                size="sm"
                                variant="default"
                                aria-label={`Load ${session.name}`}
                                onClick={() => onLoadSession(session.id)}
                              >
                                <IconFolderOpen size={12} />
                              </ActionIcon>
                            </Tooltip>
                          </Group>
                        ))}
                      </Stack>
                    )}
                  </Stack>
                </Card>
              ))}
            </Stack>
          </CollapsibleSection>
        )}
      </Stack>
    </>
  );
};

import {
  Card, Text, Button, Group, Stack, Badge, ActionIcon,
  TextInput, Select, Modal, CopyButton, Code, Divider, ScrollArea,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useState, useMemo } from 'react';
import { useSessionStore } from '../store/useSessionStore';
import { RegexSet } from '../types';
import { FaTrash, FaPlus, FaCopy, FaCheck, FaMagic } from 'react-icons/fa';
import { generateRunRegex, generateSlamRegex, trimmedMean } from '../utils/priceUtils';

const TYPE_COLORS: Record<string, string> = { run: 'green', slam: 'orange', sinistral: 'violet', dextral: 'cyan', other: 'gray' };
const TYPE_LABELS: Record<string, string>  = { run: 'Run', slam: 'Slam', sinistral: 'Sinistral', dextral: 'Dextral', other: 'Other' };

// ─── Fixed Sinistral / Dextral presets (uber tier 16.5 mods) ─────────────────
//
// Sinistral doubles PREFIX effects, voids all suffixes.
// S-tier prefixes: Magnifying ("fire 2 additional"), Savage ("increased Monster Damage"),
//   Fleet ("Monster Movement Speed"), Chaining ("Chain 3 additional")
// A-tier prefixes (47% currency): Fecund ("more Monster Life"), Stalwart ("Block Attack"),
//   Punishing ("reflect 20%"), Ultimate ("Bloodstained Sawblades"), Diluted ("less Flasks")
//
// Dextral doubles SUFFIX effects, voids all prefixes.
// S-tier suffixes: of Exposure ("maximum Resistances" +19q/20p),
//   of Defiance ("expire 100% faster" +64% currency),
//   of Penetration ("Penetrates 15% Elemental" +19q/72r)
// A-tier suffixes (45–47% currency): of Imbibing ("Meteor when Flask"),
//   of the Juggernaut ("Action Speed cannot be modified"),
//   of Curses ("Players are Cursed with Vulnerability")
//
// Two-term AND strategy: map must contain one from Term 1 AND one from Term 2.
// That proves it has at least 2 different good mods on the target side.
// A map with only one good mod only matches Term 1 → excluded.

const SD_PRESETS = {
  sinistral: {
    two: '"fire 2 additional Proj|increased Monster Damage|Monster Movement Speed|Chain 3 additional" "more Monster Life|Chance to Block Attack|less effect of Flasks|Bloodstained Sawblades|reflect 20% of Physical"',
    three: '"fire 2 additional Proj|increased Monster Damage" "Monster Movement Speed|Chain 3 additional" "more Monster Life|Chance to Block Attack|less effect of Flasks|Bloodstained Sawblades"',
  },
  dextral: {
    two: '"maximum Resistances|expire 100% faster|Penetrates 15% Elemental" "Meteor when they use a Flask|Action Speed cannot be modified|Players are Cursed with Vulnerability|increased Critical Strike Chance"',
    three: '"maximum Resistances|expire 100% faster" "Penetrates 15% Elemental|Meteor when they use a Flask" "Action Speed cannot be modified|Players are Cursed with Vulnerability|increased Critical Strike Chance"',
  },
};

const KEYWORD_REF = [
  // Sinistral keywords
  { key: '"fire 2 additional Proj"',       label: 'Magnifying (S prefix)' },
  { key: '"increased Monster Damage"',     label: 'Savage (S prefix)' },
  { key: '"Monster Movement Speed"',       label: 'Fleet (S prefix)' },
  { key: '"Chain 3 additional"',           label: 'Chaining (S prefix)' },
  { key: '"more Monster Life"',            label: 'Fecund (A prefix, +47% curr)' },
  { key: '"Chance to Block Attack"',       label: 'Stalwart (A prefix, +47% curr)' },
  { key: '"less effect of Flasks"',        label: 'Diluted (A prefix, +47% curr)' },
  { key: '"Bloodstained Sawblades"',       label: 'Ultimate (A prefix, +47% curr)' },
  // Dextral keywords
  { key: '"maximum Resistances"',                  label: 'of Exposure (S suffix, +19q/20p)' },
  { key: '"expire 100% faster"',                   label: 'of Defiance (S suffix, +64% curr)' },
  { key: '"Penetrates 15% Elemental"',             label: 'of Penetration (S suffix, +19q/72r)' },
  { key: '"Meteor when they use a Flask"',          label: 'of Imbibing (A suffix, +45% curr)' },
  { key: '"Action Speed cannot be modified"',      label: 'of Juggernaut (A suffix, +47% curr)' },
  { key: '"Players are Cursed with Vulnerability"', label: 'of Curses (A suffix, +35% scarabs)' },
  { key: '"increased Critical Strike Chance"',     label: 'of Deadliness (A suffix)' },
];

export const RegexModule = () => {
  const { settings, saveRegexSet, deleteRegexSet, maps } = useSessionStore();
  const [newOpen, { open: openNew, close: closeNew }] = useDisclosure(false);
  const [showKeywords, setShowKeywords] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType]   = useState<string>('run');
  const [newLine, setNewLine]   = useState('');

  const regexSets: RegexSet[] = settings.regexSets ?? [];

  // Trimmed mean averages from parsed maps
  const generatedRegex = useMemo(() => {
    if (maps.length === 0) return null;
    const avg = {
      avgQuant:   trimmedMean(maps.map((m) => m.quantity)),
      avgPack:    trimmedMean(maps.map((m) => m.packSize)),
      avgCurr:    trimmedMean(maps.map((m) => m.moreCurrency)),
      avgRarity:  trimmedMean(maps.map((m) => m.rarity)),
      avgScarabs: trimmedMean(maps.map((m) => m.moreScarabs)),
    };
    return { run: generateRunRegex(avg), slam: generateSlamRegex(avg), avg, n: maps.length };
  }, [maps]);

  const handleSave = () => {
    if (!newLabel.trim() || !newLine.trim()) return;
    saveRegexSet({ label: newLabel.trim(), type: newType as any, lines: [newLine.trim()] });
    setNewLabel(''); setNewLine('');
    closeNew();
  };

  const CopyLine = ({ value }: { value: string }) => (
    <CopyButton value={value}>
      {({ copied, copy }) => (
        <ActionIcon size="xs" variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy}>
          {copied ? <FaCheck size={8} /> : <FaCopy size={8} />}
        </ActionIcon>
      )}
    </CopyButton>
  );

  const RegexLine = ({ value, label }: { value: string; label?: string }) => (
    <Group gap={4} wrap="nowrap">
      <CopyLine value={value} />
      <Code style={{ fontSize: 10, flex: 1, wordBreak: 'break-all' }}>{value}</Code>
      {label && <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap', minWidth: 160 }}>{label}</Text>}
    </Group>
  );

  return (
    <>
      <Modal opened={newOpen} onClose={closeNew} title="Save Regex Set" size="md">
        <Stack gap="sm">
          <TextInput label="Label" value={newLabel} onChange={(e) => setNewLabel(e.currentTarget.value)} />
          <Select label="Type"
            data={[
              { value: 'run',       label: '🟢 Run — run as-is' },
              { value: 'slam',      label: '🟠 Slam — exalt first, open slot' },
              { value: 'sinistral', label: '🟣 Sinistral — double prefixes' },
              { value: 'dextral',   label: '🔵 Dextral — double suffixes' },
              { value: 'other',     label: '⚪ Other' },
            ]}
            value={newType} onChange={(v) => setNewType(v ?? 'run')} />
          <TextInput label="Regex" value={newLine} onChange={(e) => setNewLine(e.currentTarget.value)}
            styles={{ input: { fontFamily: 'monospace', fontSize: 12 } }} />
          <Button onClick={handleSave} disabled={!newLabel.trim() || !newLine.trim()}>Save</Button>
        </Stack>
      </Modal>

      <Card shadow="sm" padding="sm" radius="md" withBorder h="100%"
        style={{ display: 'flex', flexDirection: 'column' }}>
        <Group justify="space-between" mb="xs">
          <Text fw={700} size="sm">Regex Sets</Text>
          <Group gap={5}>
            <Button size="xs" variant="subtle" onClick={() => setShowKeywords((v) => !v)}>
              {showKeywords ? '▲' : '▼'} Keywords
            </Button>
            <Button size="xs" variant="light" leftSection={<FaPlus size={10} />} onClick={openNew}>New</Button>
          </Group>
        </Group>

        <ScrollArea style={{ flex: 1 }}>
          <Stack gap="xs">

            {/* ── Keyword reference ──────────────────────────────────── */}
            {showKeywords && (
              <Stack gap={3} p="xs" style={{ background: '#1e1f22', borderRadius: 6 }}>
                <Text size="xs" fw={600} c="dimmed">Individual mod keywords (click to copy)</Text>
                {KEYWORD_REF.map((r) => <RegexLine key={r.key} value={r.key} label={r.label} />)}
              </Stack>
            )}

            {/* ── Generated from session ─────────────────────────────── */}
            {generatedRegex && (
              <Stack gap="xs" p="xs" style={{ background: '#1a2020', borderRadius: 6, border: '1px solid #2a4040' }}>
                <Group gap="xs">
                  <FaMagic size={10} color="#4dabf7" />
                  <Text size="xs" fw={700} c="blue">Generated from {generatedRegex.n} maps (trimmed avg)</Text>
                </Group>
                <Text size="xs" c="dimmed">
                  {generatedRegex.avg.avgQuant.toFixed(0)}%Q · {generatedRegex.avg.avgRarity.toFixed(0)}%R · {generatedRegex.avg.avgPack.toFixed(0)}%P · {generatedRegex.avg.avgCurr.toFixed(0)}% Curr
                </Text>
                <Group gap="xs" wrap="nowrap">
                  <Badge color="green" size="xs" style={{ flexShrink: 0 }}>Run</Badge>
                  <RegexLine value={generatedRegex.run} />
                </Group>
                <Group gap="xs" wrap="nowrap">
                  <Badge color="orange" size="xs" style={{ flexShrink: 0 }}>Slam</Badge>
                  <RegexLine value={generatedRegex.slam} />
                </Group>
                <Text size="xs" c="dimmed" fs="italic">⚠ Open slot only for slam.</Text>
                <Group gap={4}>
                  <Button size="xs" variant="subtle" color="green"
                    onClick={() => saveRegexSet({ label: `Run (${generatedRegex.n} maps)`, type: 'run', lines: [generatedRegex.run] })}>
                    Save Run
                  </Button>
                  <Button size="xs" variant="subtle" color="orange"
                    onClick={() => saveRegexSet({ label: `Slam (${generatedRegex.n} maps)`, type: 'slam', lines: [generatedRegex.slam] })}>
                    Save Slam
                  </Button>
                </Group>
              </Stack>
            )}

            {/* ── Sinistral ──────────────────────────────────────────── */}
            <Stack gap={4} p="xs" style={{ background: '#1e1a2e', borderRadius: 6, border: '1px solid #4a3070' }}>
              <Group gap="xs">
                <Badge color="violet" size="xs" variant="filled">Sinistral</Badge>
                <Text size="xs" c="dimmed">doubles prefix effects · voids suffixes</Text>
              </Group>
              <Text size="xs" c="dimmed">
                <Text span fw={600} c="violet">2 good prefixes</Text> → put aside, slam for a 3rd.
                <Text span fw={600} c="violet"> 3 good prefixes</Text> → run with Sinistral.
              </Text>
              <Text size="xs" c="dimmed" mb={2}>2-prefix filter (slam candidate):</Text>
              <RegexLine value={SD_PRESETS.sinistral.two} />
              <Text size="xs" c="dimmed" mt={4} mb={2}>3-prefix filter (ready to run):</Text>
              <RegexLine value={SD_PRESETS.sinistral.three} />
              <Group gap={4} mt={2}>
                <Button size="xs" variant="subtle" color="violet"
                  onClick={() => saveRegexSet({ label: 'Sinistral 2-prefix (slam)', type: 'sinistral', lines: [SD_PRESETS.sinistral.two] })}>
                  Save 2-prefix
                </Button>
                <Button size="xs" variant="subtle" color="violet"
                  onClick={() => saveRegexSet({ label: 'Sinistral 3-prefix (run)', type: 'sinistral', lines: [SD_PRESETS.sinistral.three] })}>
                  Save 3-prefix
                </Button>
              </Group>
            </Stack>

            {/* ── Dextral ────────────────────────────────────────────── */}
            <Stack gap={4} p="xs" style={{ background: '#1a2430', borderRadius: 6, border: '1px solid #2060a0' }}>
              <Group gap="xs">
                <Badge color="cyan" size="xs" variant="filled">Dextral</Badge>
                <Text size="xs" c="dimmed">doubles suffix effects · voids prefixes</Text>
              </Group>
              <Text size="xs" c="dimmed">
                <Text span fw={600} c="cyan">2 good suffixes</Text> → put aside, slam for a 3rd.
                <Text span fw={600} c="cyan"> 3 good suffixes</Text> → run with Dextral.
              </Text>
              <Text size="xs" c="dimmed" mb={2}>2-suffix filter (slam candidate):</Text>
              <RegexLine value={SD_PRESETS.dextral.two} />
              <Text size="xs" c="dimmed" mt={4} mb={2}>3-suffix filter (ready to run):</Text>
              <RegexLine value={SD_PRESETS.dextral.three} />
              <Group gap={4} mt={2}>
                <Button size="xs" variant="subtle" color="cyan"
                  onClick={() => saveRegexSet({ label: 'Dextral 2-suffix (slam)', type: 'dextral', lines: [SD_PRESETS.dextral.two] })}>
                  Save 2-suffix
                </Button>
                <Button size="xs" variant="subtle" color="cyan"
                  onClick={() => saveRegexSet({ label: 'Dextral 3-suffix (run)', type: 'dextral', lines: [SD_PRESETS.dextral.three] })}>
                  Save 3-suffix
                </Button>
              </Group>
            </Stack>

            <Divider label="Saved Sets" labelPosition="left" />

            {regexSets.length === 0 && (
              <Text size="xs" c="dimmed" ta="center" py="md">No regex sets saved.</Text>
            )}

            {regexSets.map((set) => (
              <Stack key={set.id} gap={4} p="xs" style={{ background: '#1e1f22', borderRadius: 6 }}>
                <Group justify="space-between">
                  <Group gap="xs">
                    <Badge color={TYPE_COLORS[set.type] ?? 'gray'} size="xs" variant="light">{TYPE_LABELS[set.type] ?? set.type}</Badge>
                    <Text size="xs" fw={600}>{set.label}</Text>
                  </Group>
                  <ActionIcon size="xs" color="red" variant="subtle" onClick={() => deleteRegexSet(set.id)}>
                    <FaTrash size={8} />
                  </ActionIcon>
                </Group>
                {set.lines.map((line, i) => <RegexLine key={i} value={line} />)}
              </Stack>
            ))}
          </Stack>
        </ScrollArea>
      </Card>
    </>
  );
};

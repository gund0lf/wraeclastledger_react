import { Modal, Stack, Text, Alert, Textarea, ScrollArea } from '@mantine/core';
import { useRef, useState } from 'react';
import { useSessionStore } from '../store/useSessionStore';
import { parseDiscordExport, type DiscordImport } from '../utils/parseDiscordExport';
import { decodeStrategySetupCode, isStrategySetupCode, type StrategySetupCode } from '../../../shared/strategySetupCode';
import { decodeDiscordSharePayload, looksLikeBrotliDiscordShareWire } from '../utils/discordShareWire';
import { buildImportPreview, type StrategyImport } from '../utils/importPreview';
import { StrategyImportPreview } from './StrategyImportPreview';
import { reusableCovens } from '../../../shared/covensImport';
import { FONT } from '../utils/uiTokens';

interface Props {
  opened: boolean;
  onClose: () => void;
  onLoadBuild: (parsed: DiscordImport) => void;
  onLoadSetup: (setup: StrategySetupCode) => void;
}

export const ImportModal = ({ opened, onClose, onLoadBuild, onLoadSetup }: Props) => {
  const divinePrice = useSessionStore((s) => s.settings.divinePrice);
  const [importText, setImportText] = useState('');
  const [result, setResult] = useState<StrategyImport | null>(null);
  const [parseError, setParseError] = useState(false);
  const [importDivPrice, setImportDivPrice] = useState(divinePrice || 300);
  const parseSequence = useRef(0);

  const handleClose = () => {
    parseSequence.current += 1;
    onClose();
    setImportText(''); setResult(null); setParseError(false);
  };

  const handleTextChange = async (text: string) => {
    const sequence = ++parseSequence.current;
    setImportText(text); setResult(null); setParseError(false);
    if (/^wls\d+\./.test(text.trim())) {
      const setup = decodeStrategySetupCode(text);
      setResult(setup ? { kind: 'setup', value: setup } : null);
      setParseError(!setup);
      return;
    }
    if (text.trim().length <= 50) return;
    let parsed: DiscordImport | null = null;
    if (looksLikeBrotliDiscordShareWire(text)) {
      try {
        const decoded = await window.api.decodeDiscordShare(text);
        parsed = decoded.payloadJson ? decodeDiscordSharePayload(decoded.payloadJson) : null;
      } catch { parsed = null; }
    } else {
      parsed = parseDiscordExport(text);
    }
    if (sequence !== parseSequence.current) return;
    if (parsed?.covens) {
      const setup: StrategySetupCode = {version: 1, kind: 'setup', title: parsed.strategyName, notes: parsed.strategyNotes,
        league: parsed.league, mapType: parsed.mapType === '8-mod' ? '8-mod' : '6-mod', chisel: parsed.chisel || null,
        scarabs: [], delirium: null, astrolabe: parsed.astroType || null, atlasTreeUrl: parsed.atlasTreeUrl || null,
        runRegex: parsed.runRegex, covens: reusableCovens(parsed.covens),
        ...(parsed.covens.orbs ? {deliriumOrbTypes: parsed.covens.orbs.map(row => row.id)} : {}),
        party: {group: parsed.isGroupPlay, size: parsed.groupSize},
        multiplyingModifiers: {allocated: parsed.multiplyingModifiersAllocated, fragmentCount: parsed.multiplyingModifiersFragmentCount},
      };
      if (!isStrategySetupCode(setup)) { setResult(null); setParseError(true); return; }
      setResult({kind: 'setup', value: setup, atlasDrops: parsed.covens.atlas_drops});
    } else setResult(parsed ? { kind: 'discord', value: parsed } : null);
    setParseError(!parsed && text.trim().length > 100);
  };

  const handleLoad = () => {
    if (!result) return;
    if (result.kind === 'setup') onLoadSetup(result.value);
    else onLoadBuild(result.value);
    handleClose();
  };

  return <Modal opened={opened} onClose={handleClose} title="Import Strategy"
    size="lg" scrollAreaComponent={ScrollArea.Autosize}>
    <Stack gap="sm">
      <Text size="xs" c="dimmed">Paste a strategy code or Discord export to inspect its setup and recorded results. Load Build Settings leaves new-run prices empty.</Text>
      <Textarea placeholder="Paste code or export here — auto-parses as you type..."
        value={importText} onChange={(e) => { void handleTextChange(e.currentTarget.value); }}
        autosize minRows={4} maxRows={8} styles={{ input: { fontFamily: 'monospace', fontSize: FONT.body } }} />
      {parseError && <Alert color="red" variant="light" p="xs">
        <Text size="xs">Could not parse — paste a complete WraeclastLedger code or export. Newer code versions may require an app update.</Text>
      </Alert>}
      {result && <StrategyImportPreview data={buildImportPreview(result)} divinePrice={importDivPrice}
        panelDivinePrice={divinePrice} onDivinePrice={setImportDivPrice} onLoad={handleLoad} />}
    </Stack>
  </Modal>;
};

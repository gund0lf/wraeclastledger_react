import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const panelSource = readFileSync(
  new URL('../modules/RegexPanelModule.tsx', import.meta.url),
  'utf8',
);
const sessionSource = readFileSync(
  new URL('../modules/RegexModule.tsx', import.meta.url),
  'utf8',
);
const builderSource = readFileSync(
  new URL('../modules/RegexBuilderModule.tsx', import.meta.url),
  'utf8',
);
const cssSource = readFileSync(
  new URL('../modules/RegexPanelModule.css', import.meta.url),
  'utf8',
);

function rule(selector: string): string {
  const start = cssSource.indexOf(`${selector} {`);
  expect(start, `missing CSS rule: ${selector}`).toBeGreaterThanOrEqual(0);
  const end = cssSource.indexOf('}', start);
  expect(end, `unterminated CSS rule: ${selector}`).toBeGreaterThan(start);
  return cssSource.slice(start, end + 1).replace(/\s+/g, ' ');
}

describe('Regex visual-alignment presentation contract', () => {
  it('uses one neutral tab workspace without a generic outer Card', () => {
    expect(panelSource).toContain('<div className="regex-panel-root">');
    expect(panelSource).not.toContain('<Card');
    expect(panelSource).toContain('<Tabs.Tab value="session">From Session</Tabs.Tab>');
    expect(panelSource).toContain('<Tabs.Tab value="builder">Builder</Tabs.Tab>');
    expect(rule('.regex-panel-tab-list'))
      .toContain('background: rgba(255, 255, 255, 0.018);');
  });

  it('keeps generated output first and structural surfaces neutral', () => {
    const outputIndex = sessionSource.indexOf('className="regex-session-output"');
    const exclusionsIndex = sessionSource.indexOf('className="regex-exclusions-panel"');
    expect(outputIndex).toBeGreaterThanOrEqual(0);
    expect(exclusionsIndex).toBeGreaterThan(outputIndex);
    expect(sessionSource).not.toContain('COLOR.tintTealBg');
    expect(sessionSource).not.toContain('COLOR.tintOliveBg');
    expect(rule('.regex-session-output'))
      .toContain('background: var(--regex-surface-raised);');
  });

  it('explains why an all-corrupted session has no Slam output', () => {
    expect(sessionSource).toContain('No Slam regex generated');
    expect(sessionSource).toContain('an Exalted Orb cannot add a modifier');
  });

  it('provides a structured no-output state and accurate exclusions label', () => {
    expect(sessionSource).toContain('No session regex yet');
    expect(sessionSource).toContain('Capture maps or load a strategy');
    expect(sessionSource).toContain('Exclusions &amp; presets');
    expect(sessionSource).not.toContain('>Your Regex</Text>');
  });

  it('keeps removable exclusions and the exact copied value above the catalogues', () => {
    const summaryIndex = sessionSource.indexOf('className="regex-exclusions-summary"');
    const catalogueIndex = sessionSource.indexOf('className="regex-exclusion-catalogues"');
    expect(summaryIndex).toBeGreaterThanOrEqual(0);
    expect(catalogueIndex).toBeGreaterThan(summaryIndex);
    expect(sessionSource).toContain('className="regex-exclusion-chips"');
    expect(sessionSource).toContain('component="div" className="regex-exclusions-exact"');
    expect(sessionSource).toContain('Exclusion regex: <Code');
    expect(sessionSource).not.toContain('Preview: <Code');
    expect(rule('.regex-exclusions-exact')).toContain('margin-left: auto !important;');
    expect(rule('.regex-exclusions-exact')).toContain('text-align: right;');
  });

  it('keeps the exact value right-aligned and growing left even when empty', () => {
    expect(sessionSource).toContain("data-empty={!exclusionBlock ? 'true' : undefined}");
    const emptyRule = rule(".regex-exclusions-summary[data-empty='true'] .regex-exclusions-exact");
    expect(emptyRule).toContain('flex-basis: 100%;');
    expect(emptyRule).toContain('max-width: 100%;');
    expect(emptyRule).toContain('margin-left: auto !important;');
    expect(emptyRule).toContain('text-align: right;');
  });

  it('keeps Regular/shared and Nightmare catalogues side by side at supported widths', () => {
    expect(sessionSource).toContain(
      '<SimpleGrid className="regex-exclusion-catalogues" cols={2} spacing="md">',
    );
    expect(rule('.regex-exclusion-catalogues'))
      .toContain('grid-template-columns: repeat(2, minmax(0, 1fr)) !important;');
    expect(cssSource).not.toContain('.regex-exclusion-catalogues {\n    grid-template-columns: minmax(0, 1fr)');
  });

  it('uses one search for both catalogues and marks shared options explicitly', () => {
    expect(sessionSource).toContain('className="regex-catalogue-search"');
    expect(sessionSource).toContain('placeholder="Search regular and Nightmare mods…"');
    expect(sessionSource).toContain('options={brickModCatalogues.regular}');
    expect(sessionSource).toContain('options={brickModCatalogues.nightmare}');
    expect(sessionSource).toContain('>Shared</Badge>');
    expect(sessionSource).toContain('Each checkbox is independent');
    expect(sessionSource).toContain('Selecting a Shared row pins and marks its related variants');
    expect(sessionSource).toContain('>How this works</span>');
    expect(sessionSource.match(/>How this works<\/span>/g)).toHaveLength(1);
    expect(sessionSource).not.toContain('>?</Badge>');
    expect(sessionSource.indexOf('>How this works</span>'))
      .toBeLessThan(sessionSource.indexOf('>Exclusions &amp; presets</Text>'));
    expect(sessionSource).toContain('Shared means related, not automatically selected');
    expect(sessionSource).toContain('aria-label="Clear modifier search"');
    expect(sessionSource).toContain("onClick={() => setBrickSearch('')}");
    expect(sessionSource).not.toContain('regularBrickSearch');
    expect(sessionSource).not.toContain('nightmareBrickSearch');
  });

  it('uses each catalogue color and pins every sibling in an active family', () => {
    expect(sessionSource).toContain('nightmare ? COLOR.nightmare : COLOR.text');
    expect(sessionSource).not.toContain('nightmare && !option.shared');
    expect(sessionSource).toContain('prioritizeActiveFamilyOptions(');
    expect(sessionSource).toContain('allSelected={selectedCatalogueIds}');
    expect(sessionSource).toContain('border: `1px solid ${checked ? outlineColor : COLOR.border}`');
    expect(sessionSource).toContain('borderLeft: related && nightmare ? `2px solid ${outlineColor}`');
    expect(sessionSource).toContain('borderRight: related && !nightmare ? `2px solid ${outlineColor}`');
    expect(sessionSource).toContain("color={nightmare ? 'grape' : 'blue'}");
    expect(sessionSource).toContain('wrap="nowrap" justify="space-between"');
    expect(sessionSource).toContain('Related variant — select separately');
  });

  it('keeps Trade exclusions display-only and catalogue-authoritative', () => {
    expect(sessionSource).toContain('No modifier exclusions selected.');
    expect(sessionSource).not.toContain('Exclude maps with these mods.');
    expect(sessionSource).not.toContain('Purple = Nightmare mods.');
    expect(sessionSource).not.toContain('Display only — change these in the Regex exclusion catalogue');
    expect(sessionSource).not.toContain('Sync to Regex Exclusions');
    expect(sessionSource).not.toContain('Search and select mods to exclude');
    expect(sessionSource).not.toContain('applyBrickMultiSelectChange');
  });

  it('shows live 250-character counts and blocks over-limit copies', () => {
    expect(sessionSource).toContain('charLimit={250}');
    expect(sessionSource).toContain('{exclusionBlock.length} / 250');
    expect(sessionSource).toContain('disabled={generatedRegex.run.length > 250}');
    expect(sessionSource).toContain('{tradeRegex.length} / 250');
    expect(sessionSource).not.toContain('{r.length} / 250');
  });

  it('clears stale Trade thresholds when no session or strategy source exists', () => {
    expect(sessionSource).toContain('} else {\n      setTradeMinIIQ(0);');
    expect(sessionSource).toContain('setTradeMinIIR(0);');
    expect(sessionSource).toContain('setTradeMinPack(0);');
  });

  it('retains the accepted Builder split while neutralizing its structure', () => {
    expect(builderSource).toContain('const updateWidth = (width: number) => setWideLayout(width >= 680);');
    expect(builderSource).toContain('className="regex-builder-main-split"');
    expect(builderSource).toContain('className="regex-builder-output"');
    expect(builderSource).toContain('className="regex-builder-section-content"');
    expect(builderSource).toContain('REGEX_CHAR_LIMIT');
    expect(rule('.regex-builder-output'))
      .toContain('background: var(--regex-surface-raised);');
  });

  it('keeps Trade and both builder generation paths wired', () => {
    expect(sessionSource).toContain('title="PoE Trade Map Search"');
    expect(sessionSource).toContain('generateRunRegex(');
    expect(sessionSource).toContain('generateSlamRegex(');
    expect(sessionSource).toContain('generateTradeRegex(');
    expect(builderSource).toContain('generateBuilderRegex(groups)');
    expect(builderSource).toContain('generateMagicMapRegex({');
    expect(builderSource).toContain('title="Magic Map Workflow"');
    expect(panelSource).toContain('clearDefaultPreset');
  });
});

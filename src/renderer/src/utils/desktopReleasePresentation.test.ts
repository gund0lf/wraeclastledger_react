import { describe, expect, it } from 'vitest';
import { Model, TabNode } from 'flexlayout-react';
import { defaultLayout } from '../layout/defaultLayout';
import { CHANGELOG } from './changelog';
import { formatRegexAverageSummary } from './regexSessionPresentation';
import * as recognition from '../../../shared/authorRecognition';

describe('desktop release presentation', () => {
  it('opens map tools in one ordered tabset with a narrower Dashboard', () => {
    const layout = Model.fromJson(defaultLayout);
    const tabs: string[][] = [];
    layout.visitNodes(node => {
      if (node.getType() === 'tabset') tabs.push(node.getChildren().map(tab => (tab as TabNode).getComponent()!));
    });
    expect(tabs).toEqual([['session-log', 'atlas-tree', 'strategy-browser', 'regex', 'notes'], ['dashboard']]);
    const [centre, dashboard] = defaultLayout.layout.children;
    expect(dashboard.weight).toBeLessThan(centre.weight!);
  });
  it('groups the three releases under one comparable version', () => {
    expect(CHANGELOG[0]).toMatchObject({ version: '1.0.100', rangeLabel: '1.0.98–1.0.100' });
    expect(CHANGELOG[1].version).toBe('1.0.97');
  });
  it('labels measured Atlas Drops and More Threads in the generated summary', () => {
    const averages = {avgQuant: 64, avgRarity: 33, avgPack: 19, avgCurr: 0, avgScarabs: 77, atlasDrops: true, avgThreads: 60};
    expect(formatRegexAverageSummary(averages)).toBe('64% Atlas Drops · 33%R · 19%P · 60% More Threads');
  });
  it('uses only a verified default and honours an explicit new-name choice', () => {
    const prefs = { ...recognition.emptyAuthorPreferences(), defaultRegistrationId: 'a', registrations: [
      { registrationId: 'a', name: 'First', confirmed: true, epoch: 'epoch' },
      { registrationId: 'b', name: 'Second', confirmed: true, epoch: 'epoch' },
    ] };
    expect(recognition.initialAssignmentRegistration(prefs, null)?.name).toBe('First');
    expect(recognition.initialAssignmentRegistration(prefs, 'b')?.name).toBe('Second');
    expect(recognition.initialAssignmentRegistration(prefs, 'new')).toBeUndefined();
    prefs.registrations[0].confirmed = false;
    expect(recognition.initialAssignmentRegistration(prefs, null)).toBeUndefined();
    expect(recognition.initialAssignmentRegistration(prefs, 'missing')).toBeUndefined();
  });
});

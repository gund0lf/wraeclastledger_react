// These templates describe one tree contribution each. The planner already
// includes selected variants in its stat totals when the source supports them.
const perMap = (effect: string) => 'Your Maps have #% Surpassing Chance ' + effect;

export const surpassingOutcomes = [
  { key: 'strongbox', label: 'Strongboxes', unit: 'map', template: perMap('to contain a Strongbox') },
  { key: 'exile', label: 'Rogue Exiles', unit: 'map', template: perMap('to contain a Rogue Exile') },
  { key: 'spirit', label: 'Tormented Spirits', unit: 'map', template: perMap('to be haunted by a Tormented Spirit') },
  { key: 'essence', label: 'Imprisoned Monsters', unit: 'map', template: perMap('to contain an Imprisoned Monster') },
  { key: 'shrine', label: 'Shrines', unit: 'map', template: perMap('to contain a Shrine') },
  { key: 'flora', label: 'Sacred Flora', unit: 'map', template: perMap('to contain Sacred Flora') },
  { key: 'pit', label: 'Additional pits', unit: 'Abyss', template: 'Abysses in your Maps have #% Surpassing Chance to contain an additional Pit' },
  { key: 'reward', label: 'Additional rewards', unit: 'Blight lane', template: 'Blight Lanes in your Maps have #% Surpassing Chance to have an additional reward per Lane in Blight encounter' },
  { key: 'suffix', label: 'Additional suffixes', unit: 'Remnant', template: '#% Surpassing Chance for Remnants in your Maps to have an additional Suffix Modifier' },
  { key: 'magicLane', label: 'Surpassing Chance that a lane of Blight encounters in your Maps is at least Magic', unit: null, template: '#% Surpassing Chance that a lane of Blight encounters in your Maps is at least Magic' },
] as const;

type OutcomeKey = typeof surpassingOutcomes[number]['key'];
export type SurpassingChances = Partial<Record<OutcomeKey, number>>;

export function readSurpassingChances(normalizedStats: readonly string[]): SurpassingChances | undefined {
  let chances: SurpassingChances | undefined;
  for (const stat of normalizedStats) {
    if (!stat.includes('Surpassing Chance')) continue;
    const match = /\+?(\d+)%/.exec(stat);
    if (!match) continue;
    const percent = Number(match[1]);
    const template = stat.replace(match[0], '#%');
    const outcome = surpassingOutcomes.find(entry => entry.template === template);
    if (!outcome || !Number.isSafeInteger(percent) || percent <= 0) continue;
    chances ??= {};
    chances[outcome.key] = (chances[outcome.key] ?? 0) + percent;
  }
  return chances;
}

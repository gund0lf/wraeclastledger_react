import { SessionLogModule }     from '../modules/SessionLogModule';
import { AtlasCalcModule }      from '../modules/AtlasCalcModule';
import { StatisticsModule }     from '../modules/StatisticsModule';
import { AtlasTreeModule }      from '../modules/AtlasTreeModule';
import { InvestmentModule }     from '../modules/InvestmentModule';
import { LootModule }           from '../modules/LootModule';
import { SessionManagerModule } from '../modules/SessionManagerModule';
import { MapSearchModule }      from '../modules/MapSearchModule';
import { RegexModule }          from '../modules/RegexModule';
import { MapAnalyzerModule }    from '../modules/MapAnalyzerModule';

export const COMPONENT_REGISTRY: Record<string, () => any> = {
  'session-manager': SessionManagerModule,
  'session-log':     SessionLogModule,
  'atlas-calc':      AtlasCalcModule,
  'statistics':      StatisticsModule,
  'atlas-tree':      AtlasTreeModule,
  'investment':      InvestmentModule,
  'loot':            LootModule,
  'map-search':      MapSearchModule,
  'regex':           RegexModule,
  'map-analyzer':    MapAnalyzerModule,
};

export const getModuleComponent = (id: string) => {
  const Component = COMPONENT_REGISTRY[id];
  return Component
    ? <Component />
    : <div style={{ padding: 8, color: '#666' }}>Unknown Module: {id}</div>;
};

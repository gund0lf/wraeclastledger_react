import { SessionLogModule }     from '../modules/SessionLogModule';
import { AtlasCalcModule }      from '../modules/AtlasCalcModule';
import { StatisticsModule }     from '../modules/StatisticsModule';
import { AtlasTreeModule }      from '../modules/AtlasTreeModule';
import { InvestmentModule }     from '../modules/InvestmentModule';
import { LootModule }           from '../modules/LootModule';
import { DashboardModule }      from '../modules/DashboardModule';
import { SessionManagerModule } from '../modules/SessionManagerModule';
import { MapSearchModule }      from '../modules/MapSearchModule';
import { RegexModule }          from '../modules/RegexModule';
import { RegexBuilderModule }   from '../modules/RegexBuilderModule';
import { MapAnalyzerModule }    from '../modules/MapAnalyzerModule';
import { StrategyBrowserModule } from '../modules/StrategyBrowserModule';
import { NotesModule }           from '../modules/NotesModule';

export const COMPONENT_REGISTRY: Record<string, () => any> = {
  'session-manager': SessionManagerModule,
  'session-log':     SessionLogModule,
  'atlas-calc':      AtlasCalcModule,
  'statistics':      StatisticsModule,   // kept for existing saved layouts
  'atlas-tree':      AtlasTreeModule,
  'investment':      InvestmentModule,
  'loot':            LootModule,         // kept for existing saved layouts
  'dashboard':       DashboardModule,    // new merged stats+loot panel
  'map-search':      MapSearchModule,
  'regex':           RegexModule,
  'regex-builder':    RegexBuilderModule,
  'map-analyzer':    MapAnalyzerModule,
  'strategy-browser': StrategyBrowserModule,
  'notes':             NotesModule,
};

export const getModuleComponent = (id: string) => {
  const Component = COMPONENT_REGISTRY[id];
  return Component
    ? <Component />
    : <div style={{ padding: 8, color: '#666' }}>Unknown Module: {id}</div>;
};

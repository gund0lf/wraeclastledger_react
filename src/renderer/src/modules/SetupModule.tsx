import { CollapsibleSection } from '../components/ui/CollapsibleSection';
import { usePanelMaximized } from '../layout/panelLayoutContext';
import { SessionManagerModule } from './SessionManagerModule';
import { AtlasCalcModule } from './AtlasCalcModule';
import { InvestmentModule } from './InvestmentModule';
import './SetupModule.css';

/**
 * Compact home for the three setup-oriented tools. The FlexLayout left border
 * owns the expand/collapse interaction; these sections keep each familiar
 * panel available without rearranging its controls.
 */
export const SetupModule = () => {
  const isMaximized = usePanelMaximized('setup');

  return (
    <div className={`setup-panel-root${isMaximized ? ' is-maximized' : ''}`}>
      <div className="setup-panel-layout">
        <CollapsibleSection
          title="Sessions"
          className="setup-panel-section"
          headerClassName="setup-panel-section-header"
          contentClassName="setup-panel-section-content"
        >
          <SessionManagerModule embedded />
        </CollapsibleSection>
        <CollapsibleSection
          title="Atlas Calc"
          className="setup-panel-section"
          headerClassName="setup-panel-section-header"
          contentClassName="setup-panel-section-content"
        >
          <AtlasCalcModule embedded />
        </CollapsibleSection>
        <CollapsibleSection
          title="Investment"
          className="setup-panel-section"
          headerClassName="setup-panel-section-header"
          contentClassName="setup-panel-section-content"
        >
          <InvestmentModule embedded />
        </CollapsibleSection>
      </div>
    </div>
  );
};

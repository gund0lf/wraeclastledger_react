export type StrategyBackIntent =
  | {
      kind: 'keyboard';
      key: string;
      altKey: boolean;
      ctrlKey: boolean;
      metaKey: boolean;
      targetEditable: boolean;
      defaultPrevented: boolean;
    }
  | {
      kind: 'mouse';
      button: number;
      defaultPrevented: boolean;
    };

/**
 * Strategy details are an in-panel disclosure, not an application route.
 * Recognise familiar Back gestures without adding entries to global history.
 */
export function isStrategyBackIntent(intent: StrategyBackIntent): boolean {
  if (intent.defaultPrevented) return false;
  if (intent.kind === 'mouse') return intent.button === 3;
  if (intent.targetEditable) return false;
  if (intent.key === 'Escape') return true;
  return intent.key === 'ArrowLeft'
    && intent.altKey
    && !intent.ctrlKey
    && !intent.metaKey;
}

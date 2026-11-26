import { Button } from '@mantine/core';
import { useSessionStore } from '../store/useSessionStore';

export function OverlayVisibilityButton({ compact = false }: { compact?: boolean }) {
  const visible = useSessionStore(state => state.overlayPreferences.visible);
  const setOverlayPreferences = useSessionStore(state => state.setOverlayPreferences);
  return (
    <Button
      size={compact ? 'compact-xs' : 'sm'}
      variant={compact ? 'subtle' : 'default'}
      color={visible ? 'blue' : 'gray'}
      onClick={() => setOverlayPreferences(visible ? { visible: false, clickThrough: false } : { visible: true })}
    >
      {visible ? 'Hide overlay' : 'Show overlay'}
    </Button>
  );
}

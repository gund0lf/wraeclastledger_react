import { Button, Group, Stack, Text } from '@mantine/core';
import { useEffect, useId, useState, type MouseEvent } from 'react';
import type { OverlayShortcutStatus } from '../../../shared/overlay';
import { OverlayShortcutCapture, type ShortcutCaptureView } from '../utils/overlayShortcutCapture';
import { sameOverlayShortcut } from '../utils/overlayShortcutRecorder';

interface Props {
  label: string;
  helpId: string;
  value: string;
  open: boolean;
  status: OverlayShortcutStatus['timer'] | undefined;
  conflict: (accelerator: string, isMac: boolean) => string | undefined;
  onChange: (accelerator: string) => void;
  onStatus: (status: OverlayShortcutStatus) => void;
}

export function OverlayShortcutRecorder({ label, helpId, value, open, status, conflict, onChange, onStatus }: Props) {
  const labelId = useId();
  const valueId = useId();
  const statusId = useId();
  const [view, setView] = useState<ShortcutCaptureView>({ recording: false, message: '' });
  const [capture] = useState(() => new OverlayShortcutCapture(
    (token, recording) => window.api.setOverlayShortcutRecording(token, recording),
    setView, onStatus,
  ));

  useEffect(() => {
    const cancel = () => capture.cancel();
    window.addEventListener('blur', cancel);
    return () => {
      window.removeEventListener('blur', cancel);
      capture.cancel(false);
    };
  }, [capture]);
  useEffect(() => { if (!open) capture.cancel(); }, [capture, open]);

  const unavailable = value && status?.accelerator === value && !status.registered;
  const singleKeyHint = value && !value.includes('+')
    ? `While this shortcut is active, other apps may not receive ${value}. Clear it to free the key.`
    : '';
  const message = view.message || (unavailable ? 'This shortcut is unavailable. Choose another combination.' : singleKeyHint);
  const sideButton = (event: MouseEvent<HTMLButtonElement>) => {
    if ((event.button === 3 || event.button === 4) && capture.sideButton()) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  return (
    <Stack gap={2} role="group" aria-labelledby={labelId}>
      <Group justify="space-between" gap="xs">
        <div>
          <Text id={labelId} size="sm" fw={500}>{label}</Text>
          <Text id={valueId} size="xs" c="dimmed">{value || 'Not set'}</Text>
        </div>
        <Group gap="xs">
          <Button
            type="button" size="compact-sm" variant={view.recording ? 'light' : 'default'}
            aria-label={view.recording ? 'Cancel recording ' + label : 'Record ' + label}
            aria-describedby={[valueId, helpId, statusId].join(' ')}
            data-mantine-stop-propagation={view.recording || undefined}
            onClick={event => {
              event.currentTarget.focus();
              if (view.recording) capture.cancel();
              else void capture.begin(crypto.randomUUID());
            }}
            onBlur={() => capture.cancel()}
            onKeyDown={event => {
              if (capture.keyDown(event.nativeEvent, /^Mac/i.test(navigator.platform))) {
                event.preventDefault();
                event.stopPropagation();
              }
            }}
            onKeyUp={event => {
              const isMac = /^Mac/i.test(navigator.platform);
              if (capture.keyUp(event.nativeEvent, candidate => conflict(candidate, isMac), candidate => {
                if (!sameOverlayShortcut(value, candidate, isMac)) onChange(candidate);
              })) {
                event.preventDefault();
                event.stopPropagation();
              }
            }}
            onMouseDown={sideButton} onMouseUp={sideButton} onAuxClick={sideButton}
          >
            {view.recording ? 'Cancel' : 'Record'}
          </Button>
          <Button
            type="button" size="compact-sm" variant="subtle" disabled={!value}
            aria-label={'Clear ' + label} onClick={() => { capture.cancel(); onChange(''); }}
          >
            Clear
          </Button>
        </Group>
      </Group>
      <Text id={statusId} size="xs" c={unavailable && !view.recording ? 'red' : 'dimmed'} role="status">
        {message}
      </Text>
    </Stack>
  );
}

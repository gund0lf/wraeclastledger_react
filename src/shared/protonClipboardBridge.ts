export const PROTON_CLIPBOARD_PROTOCOL = 'WLCLIP/1';
export const PROTON_CLIPBOARD_MAX_TEXT_BYTES = 1024 * 1024;

export type ClipboardBridgeStatus =
  | { state: 'idle' }
  | { state: 'connecting'; message: string }
  | { state: 'ready'; message: string }
  | { state: 'error'; message: string };

export type ProtonClipboardEvent =
  | { type: 'ready' }
  | { type: 'text'; text: string };

const MAX_HEADER_BYTES = 8192;

/** Decodes the helper's byte-framed stdout while ignoring launcher chatter. */
export class ProtonClipboardFrameDecoder {
  private buffer = Buffer.alloc(0);
  private expectedTextBytes: number | null = null;
  private readonly utf8Decoder = new TextDecoder('utf-8', { fatal: true });

  push(chunk: Uint8Array): ProtonClipboardEvent[] {
    if (chunk.byteLength === 0) return [];
    this.buffer = Buffer.concat([this.buffer, Buffer.from(chunk)]);
    const events: ProtonClipboardEvent[] = [];

    while (this.buffer.byteLength > 0) {
      if (this.expectedTextBytes !== null) {
        const frameBytes = this.expectedTextBytes + 1;
        if (this.buffer.byteLength < frameBytes) break;
        if (this.buffer[this.expectedTextBytes] !== 0x0a) {
          throw new Error('Proton clipboard TEXT frame is missing its LF delimiter');
        }
        const body = this.buffer.subarray(0, this.expectedTextBytes);
        this.buffer = this.buffer.subarray(frameBytes);
        this.expectedTextBytes = null;
        let text: string;
        try {
          text = this.utf8Decoder.decode(body);
        } catch {
          throw new Error('Proton clipboard TEXT frame is not valid UTF-8');
        }
        events.push({ type: 'text', text });
        continue;
      }

      const newline = this.buffer.indexOf(0x0a);
      if (newline < 0) {
        if (this.buffer.byteLength > MAX_HEADER_BYTES) {
          throw new Error('Proton clipboard frame header exceeds the size limit');
        }
        break;
      }

      const rawLine = this.buffer.subarray(0, newline);
      this.buffer = this.buffer.subarray(newline + 1);
      const line = rawLine.at(-1) === 0x0d
        ? rawLine.subarray(0, rawLine.byteLength - 1).toString('utf8')
        : rawLine.toString('utf8');

      if (line === `${PROTON_CLIPBOARD_PROTOCOL} READY`) {
        events.push({ type: 'ready' });
        continue;
      }
      if (!line.startsWith(`${PROTON_CLIPBOARD_PROTOCOL} `)) continue;

      const match = line.match(/^WLCLIP\/1 TEXT ([1-9]\d*)$/);
      if (!match) throw new Error(`Invalid Proton clipboard frame header: ${line}`);
      const byteLength = Number(match[1]);
      if (!Number.isSafeInteger(byteLength) || byteLength > PROTON_CLIPBOARD_MAX_TEXT_BYTES) {
        throw new Error(`Proton clipboard TEXT frame exceeds ${PROTON_CLIPBOARD_MAX_TEXT_BYTES} bytes`);
      }
      this.expectedTextBytes = byteLength;
    }

    return events;
  }
}

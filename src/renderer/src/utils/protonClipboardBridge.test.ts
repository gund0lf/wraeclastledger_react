import { describe, expect, it } from 'vitest';
import {
  PROTON_CLIPBOARD_MAX_TEXT_BYTES,
  ProtonClipboardFrameDecoder,
} from '../../../shared/protonClipboardBridge';

function textFrame(text: string): Buffer {
  const body = Buffer.from(text, 'utf8');
  return Buffer.concat([Buffer.from(`WLCLIP/1 TEXT ${body.byteLength}\n`), body, Buffer.from('\n')]);
}

describe('ProtonClipboardFrameDecoder', () => {
  it('preserves three multiline clipboard events in order', () => {
    const decoder = new ProtonClipboardFrameDecoder();
    const input = Buffer.concat([
      Buffer.from('protontricks warning\nWLCLIP/1 READY\n'),
      textFrame('Map one\nfirst'),
      textFrame('Map two\nsecond'),
      textFrame('Map three\nthird'),
    ]);

    expect(decoder.push(input)).toEqual([
      { type: 'ready' },
      { type: 'text', text: 'Map one\nfirst' },
      { type: 'text', text: 'Map two\nsecond' },
      { type: 'text', text: 'Map three\nthird' },
    ]);
  });

  it('handles split headers, split Unicode bodies, and CRLF launcher output', () => {
    const decoder = new ProtonClipboardFrameDecoder();
    const unicodeText = 'M\u00e4p \ud83d\uddfa\ufe0f';
    const frame = Buffer.concat([Buffer.from('noise\r\n'), textFrame(unicodeText)]);
    expect(decoder.push(frame.subarray(0, 9))).toEqual([]);
    expect(decoder.push(frame.subarray(9, frame.byteLength - 2))).toEqual([]);
    expect(decoder.push(frame.subarray(frame.byteLength - 2))).toEqual([
      { type: 'text', text: unicodeText },
    ]);
  });

  it('rejects malformed protocol headers', () => {
    const decoder = new ProtonClipboardFrameDecoder();
    expect(() => decoder.push(Buffer.from('WLCLIP/1 TEXT nope\n'))).toThrow(
      'Invalid Proton clipboard frame header',
    );
  });

  it('rejects oversized frames before reading the body', () => {
    const decoder = new ProtonClipboardFrameDecoder();
    expect(() => decoder.push(Buffer.from(
      `WLCLIP/1 TEXT ${PROTON_CLIPBOARD_MAX_TEXT_BYTES + 1}\n`,
    ))).toThrow('exceeds');
  });

  it('rejects a body without the required trailing delimiter', () => {
    const decoder = new ProtonClipboardFrameDecoder();
    expect(() => decoder.push(Buffer.from('WLCLIP/1 TEXT 3\nabc!'))).toThrow('LF delimiter');
  });
});

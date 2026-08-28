import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const atlasModuleSource = readFileSync(
  new URL('../modules/AtlasTreeModule.tsx', import.meta.url),
  'utf8',
);
const mainSource = readFileSync(
  new URL('../../../main/index.ts', import.meta.url),
  'utf8',
);

describe('Atlas guest popup security contract', () => {
  it('does not enable the boolean allowpopups webview capability', () => {
    expect(atlasModuleSource).not.toMatch(/\ballowpopups\b/i);
  });

  it('denies window creation on attached guest webContents', () => {
    expect(mainSource).toMatch(/on\('did-attach-webview'/);
    expect(mainSource).toMatch(
      /guestWebContents\.setWindowOpenHandler\(\(\) => \(\{ action: 'deny' \}\)\)/,
    );
  });
});

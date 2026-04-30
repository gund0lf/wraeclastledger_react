import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // node environment — tests target pure utility functions, no DOM needed.
    environment: 'node',
    include: ['src/renderer/src/**/*.test.ts'],
    // electron's native dirs aren't relevant to pure-function tests
    exclude: ['node_modules', 'dist', 'out', 'build'],
  },
});

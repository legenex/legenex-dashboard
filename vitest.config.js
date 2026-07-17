import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Scoped to the distribution engine unit tests plus the distribution nav render
// test. The engine is pure and runtime-agnostic; the nav test uses react-dom
// server rendering (no jsdom needed), so the default node environment is correct.
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: [
      'src/lib/distribution/**/*.test.js',
      'src/components/distribution/**/*.test.jsx',
    ],
  },
});

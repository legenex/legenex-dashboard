import { defineConfig } from 'vitest/config';

// Scoped to the distribution engine unit tests for now. The engine is pure and
// runtime-agnostic, so the default node environment is correct (no jsdom).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/lib/distribution/**/*.test.js'],
  },
});

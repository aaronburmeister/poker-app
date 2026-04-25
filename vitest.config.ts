import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@poker/shared': join(root, 'shared/src/index.ts'),
    },
  },
  test: {
    include: ['server/src/__tests__/**/*.test.ts'],
  },
});

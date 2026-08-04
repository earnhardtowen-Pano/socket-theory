import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'core/test/**/*.test.ts',
      'data/test/**/*.test.ts',
      'geometry/test/**/*.test.ts',
      'validation/test/**/*.test.ts',
    ],
  },
});

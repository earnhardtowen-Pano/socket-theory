import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

// The remote environment pins Chromium outside Playwright's registry.
const pinnedChromium = '/opt/pw-browsers/chromium';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 1600, height: 1000 },
    ...(existsSync(pinnedChromium)
      ? { launchOptions: { executablePath: pinnedChromium } }
      : {}),
  },
  webServer: {
    command: 'pnpm preview --port 4173 --strictPort',
    port: 4173,
    reuseExistingServer: true,
  },
});

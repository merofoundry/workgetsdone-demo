import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './tests', fullyParallel: true, use: { baseURL: 'http://127.0.0.1:4173', timezoneId: 'America/New_York' }, webServer: { command: 'node scripts/serve-dist.mjs', port: 4173, reuseExistingServer: !process.env.CI }, reporter: [['list']], outputDir: 'test-results' });

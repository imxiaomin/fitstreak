import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/nutrition-browser', workers: 1, timeout: 60000,
  reporter: [['list'], ['json', { outputFile: 'docs/test-results-nutrition.json' }]],
  use: { baseURL: 'http://127.0.0.1:5177', launchOptions: process.platform === 'win32' ? { executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' } : {}, screenshot: 'only-on-failure' },
  webServer: [
    { command: 'npx tsx tests/fixtures/nutrition-server.mts', url: 'http://127.0.0.1:3014/health', reuseExistingServer: false },
    { command: 'npm run dev -w @fitstreak/web -- --port 5177', url: 'http://127.0.0.1:5177', env: { VITE_API_BASE: 'http://127.0.0.1:3014' }, reuseExistingServer: false },
  ],
});

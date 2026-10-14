import { defineConfig, devices } from '@playwright/test';

const PORTA = Number(process.env.PORTA_E2E) || 3100;
const URL_BASE = `http://127.0.0.1:${PORTA}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: URL_BASE,
    trace: 'on-first-retry'
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } }
  ],
  // Sobe o servidor automaticamente antes dos testes
  webServer: {
    command: 'node src/server.js',
    url: `${URL_BASE}/health`,
    env: { PORT: String(PORTA) },
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
  }
});

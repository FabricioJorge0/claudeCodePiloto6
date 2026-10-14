import { defineConfig, devices } from '@playwright/test';

// BASE_URL definida: testa um ambiente já publicado (ex.: Vercel) e não sobe servidor local.
// BASE_URL ausente: sobe o servidor local na PORTA_E2E (padrão 3100).
const PORTA = Number(process.env.PORTA_E2E) || 3100;
const URL_REMOTA = process.env.BASE_URL?.replace(/\/+$/, '');
const URL_BASE = URL_REMOTA || `http://127.0.0.1:${PORTA}`;

// Deploys protegidos da Vercel (Deployment Protection) exigem o segredo
// "Protection Bypass for Automation". Nunca versionar o valor: usar variável de ambiente.
const SEGREDO_VERCEL = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: URL_BASE,
    // Em ambiente publicado, grava trace de todos os testes (evidência);
    // localmente/CI, só na nova tentativa após falha.
    trace: URL_REMOTA ? 'on' : 'on-first-retry',
    ...(SEGREDO_VERCEL && {
      extraHTTPHeaders: {
        'x-vercel-protection-bypass': SEGREDO_VERCEL,
        'x-vercel-set-bypass-cookie': 'true'
      }
    })
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } }
  ],
  // Sobe o servidor automaticamente antes dos testes (somente sem BASE_URL)
  webServer: URL_REMOTA
    ? undefined
    : {
        command: 'node src/server.js',
        url: `${URL_BASE}/health`,
        env: { PORT: String(PORTA) },
        reuseExistingServer: !process.env.CI,
        timeout: 30_000
      }
});

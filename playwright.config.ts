import { defineConfig, devices } from '@playwright/test';
// Con E2E_COMUNIDAD_URL las pruebas corren contra una instancia real (PWA + API en el mismo origen).
const instancia = process.env['E2E_COMUNIDAD_URL'];
export default defineConfig({
  testDir: './e2e',
  timeout: 90000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    ...devices['Pixel 7'],
    baseURL: instancia ?? 'http://127.0.0.1:4173',
    headless: true,
    trace: 'retain-on-failure',
    launchOptions: { executablePath: process.env['CHROMIUM_PATH'], args: ['--no-sandbox'] },
  },
  webServer: instancia
    ? undefined
    : {
        command: 'npm run preview',
        url: 'http://127.0.0.1:4173',
        reuseExistingServer: !process.env['CI'],
      },
});

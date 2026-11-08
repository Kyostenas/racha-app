import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const url = 'https://kyostenas.github.io/racha-app/';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  args: ['--no-sandbox'],
});
try {
  const context = await browser.newContext({ viewport: { width: 412, height: 900 } });
  const page = await context.newPage();
  const failures = [];
  page.on('pageerror', (e) => failures.push(e.message));
  const response = await page.goto(url);
  assert.equal(response.status(), 200);
  await page.getByRole('heading', { name: 'Haz espacio para ti.' }).waitFor();
  await page.getByLabel('Acepto el uso local de mis datos').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  for (const name of ['Arroz blanco cocido', 'Huevo entero crudo', 'Jitomate rojo crudo'])
    await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('button', { name: 'Crear mi primer día' }).click();
  await page.getByRole('button', { name: 'Empezar', exact: true }).click();
  await page.getByRole('button', { name: /Elegir agua en una comida/ }).click();
  await page.getByTestId('streak').filter({ hasText: '1' }).waitFor();
  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  await page.getByRole('heading', { name: 'Arroz con huevo y jitomate', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await page.getByLabel('Modo OLED').check();
  await page.locator('html[data-oled]').waitFor();
  assert.equal(
    await page.locator('html').evaluate((e) => getComputedStyle(e).backgroundColor),
    'rgb(0, 0, 0)',
  );
  await page.getByRole('button', { name: 'Hoy', exact: true }).click();
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await page.getByTestId('streak').waitFor();
  await context.setOffline(true);
  await page.reload();
  await page.getByTestId('streak').waitFor();
  await context.setOffline(false);
  await page.screenshot({ path: 'docs/capturas/18-pages-en-vivo.png', fullPage: false });
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await page.getByRole('button', { name: 'Avanzado › IA' }).click();
  await page
    .getByText('Tu clave se guarda solo en este teléfono, sin candado.', { exact: false })
    .waitFor();
  assert.equal(await page.locator('.ai-details').getAttribute('open'), null);
  assert.equal(
    await page
      .getByRole('button', { name: 'En tu cel · Próximamente', exact: true })
      .evaluate((e) => getComputedStyle(e).textTransform),
    'none',
  );
  assert.match(await page.locator('.danger').innerText(), /en este teléfono o computadora/);
  await page.screenshot({ path: 'docs/capturas/22-ia-en-vivo.png', fullPage: true });
  assert.deepEqual(failures, []);
  console.log(
    JSON.stringify({
      resultado: 'PASS',
      url,
      onboarding: true,
      receta: true,
      racha: true,
      oled: true,
      offline: true,
      erroresConsola: failures,
    }),
  );
} finally {
  await browser.close();
}

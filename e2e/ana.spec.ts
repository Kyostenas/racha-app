import { test, expect, Page } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
const shots = 'docs/capturas';
async function shot(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
}
async function onboard(page: Page, allergy = '') {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Haz espacio para ti.' })).toBeVisible();
  await page.getByRole('button', { name: 'bajar de peso', exact: true }).click();
  await page.getByLabel('Acepto el uso local de mis datos').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  if (allergy) await page.getByLabel('Alergias (separadas por coma)').fill(allergy);
  for (const name of ['Arroz blanco cocido', 'Huevo entero crudo', 'Tomate rojo crudo'])
    await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('button', { name: 'Crear mi primer día' }).click();
  await page.getByRole('button', { name: 'Empezar', exact: true }).click();
}
test('Ana: onboarding, fuente, hábito, racha, temas, privacidad, offline y borrar', async ({
  page,
  context,
}) => {
  await mkdir(shots, { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Haz espacio para ti.' })).toBeVisible();
  await shot(page, '01-intencion');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('alert')).toContainText('Acepta');
  await page.getByRole('button', { name: 'bajar de peso', exact: true }).click();
  await page.getByLabel('Acepto el uso local de mis datos').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await shot(page, '02-lo-minimo');
  await page.getByLabel('Edad (años)').fill('17');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('alert')).toContainText('adultos');
  await page.getByLabel('Edad (años)').fill('21');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByLabel('Padecimientos (opcional)')).toHaveCount(0);
  for (const name of ['Arroz blanco cocido', 'Huevo entero crudo', 'Tomate rojo crudo'])
    await page.getByRole('button', { name, exact: true }).click();
  await shot(page, '03-despensa-seguridad');
  await page.getByRole('button', { name: 'Crear mi primer día' }).click();
  await expect(page.getByRole('heading', { name: 'Tu primer día.' })).toBeVisible();
  await shot(page, '04-primer-dia');
  await page.getByRole('button', { name: 'Empezar', exact: true }).click();
  await expect(page.getByTestId('streak')).toContainText('0');
  await shot(page, '05-hoy');
  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Arroz con huevo y tomate', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Fuentes y método' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'USDA · Arroz blanco cocido ↗' })).toHaveAttribute(
    'href',
    /168878/,
  );
  await shot(page, '06-plan-fuentes');
  await page.getByRole('button', { name: 'Hoy', exact: true }).click();
  await page.getByRole('button', { name: /Elegir agua en una comida/ }).click();
  await expect(page.getByTestId('streak')).toContainText('1');
  await shot(page, '07-hoy-racha');
  await page.getByRole('button', { name: /Moverme a mi ritmo/ }).click();
  await expect(page.getByTestId('streak')).toContainText('1');
  await page.reload();
  await expect(page.getByTestId('streak')).toContainText('1');
  await expect(page.getByRole('button', { name: /Elegir agua en una comida/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Progreso', exact: true }).click();
  await expect(page.getByRole('listitem')).toHaveCount(42);
  await shot(page, '08-progreso');
  await page.getByRole('button', { name: 'Ver mi logro', exact: true }).click();
  await expect(page.getByTestId('achievement')).not.toContainText(
    /peso|medicamento|padecimiento|65|165/i,
  );
  await shot(page, '09-logro');
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'canShare', { value: () => false, configurable: true });
  });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Compartir o descargar PNG' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('racha-logro.png');
  await download.saveAs(`${shots}/logro-exportado.png`);
  const png = await readFile(`${shots}/logro-exportado.png`);
  expect(png.readUInt32BE(16)).toBe(1080);
  expect(png.readUInt32BE(20)).toBe(1080);
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-tema', 'racha');
  await page.getByLabel('Modo OLED').check();
  await expect(page.locator('html')).toHaveAttribute('data-oled', '');
  expect(await page.locator('html').evaluate((e) => getComputedStyle(e).backgroundColor)).toBe(
    'rgb(0, 0, 0)',
  );
  await shot(page, '10-tema-racha-oled');
  await page.getByRole('button', { name: 'Eléctrico', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-tema', 'electrico');
  await expect(page.locator('html')).toHaveAttribute('data-oled', '');
  await shot(page, '11-tema-electrico-oled');
  await page.getByRole('button', { name: 'Alto contraste', exact: true }).click();
  await expect(page.getByLabel('Modo OLED')).toBeDisabled();
  await expect(page.locator('html')).not.toHaveAttribute('data-oled');
  await page.getByRole('button', { name: 'Racha', exact: true }).click();
  await page.getByRole('button', { name: 'Avanzado › IA' }).click();
  await expect(page.getByRole('button', { name: 'En tu cel · Próximamente' })).toBeDisabled();
  await shot(page, '12-ajustes-ia');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    await page
      .locator('button')
      .first()
      .evaluate((e) => getComputedStyle(e).borderRadius),
  ).toBe('0px');
  await page.getByRole('button', { name: 'Hoy', exact: true }).click();
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    if (reg.active?.state !== 'activated')
      await new Promise<void>((resolve) => {
        reg.active?.addEventListener('statechange', () => {
          if (reg.active?.state === 'activated') resolve();
        });
      });
  });
  await page.reload();
  await expect(page.getByTestId('streak')).toContainText('1');
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('streak')).toContainText('1');
  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Arroz con huevo y tomate', exact: true }),
  ).toBeVisible();
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await page.getByRole('button', { name: 'Borrar todos mis datos', exact: true }).click();
  await page.getByRole('button', { name: 'Sí, borrar todo', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Haz espacio para ti.' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Haz espacio para ti.' })).toBeVisible();
  expect(errors).toEqual([]);
});
test('alergia declarada bloquea receta de huevo', async ({ page }) => {
  await onboard(page, 'huevo');
  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'No hay receta que pase las reglas.' }),
  ).toBeVisible();
  await expect(page.getByText('NO SUSTITUYE A TU MÉDICO.', { exact: true })).toBeVisible();
});
test('alergia desconocida no se ignora', async ({ page }) => {
  await onboard(page, 'alergia no reconocida');
  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'No hay receta que pase las reglas.' }),
  ).toBeVisible();
});
test.describe('IA con proveedor simulado sin interceptación del service worker', () => {
  test.use({ serviceWorkers: 'block' });
  test('adaptador IA compatible rechaza recetas inventadas', async ({ page }) => {
    await onboard(page);
    await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
    await page.getByRole('button', { name: 'Avanzado › IA' }).click();
    await page.getByLabel('URL base (HTTPS)').fill('https://proveedor.example/v1');
    await page.getByLabel('Modelo', { exact: true }).fill('modelo-de-prueba');
    await page.getByLabel('Clave propia', { exact: true }).fill('clave-ficticia-para-test');
    await page.getByLabel('Acepto enviar solo las opciones').check();
    await page.getByRole('button', { name: 'Guardar y activar clave propia' }).click();
    await expect(page.getByRole('status')).toContainText('Configuración guardada');
    let responseId = 'arroz-huevo-tomate';
    const requests: string[] = [];
    await page.route('https://proveedor.example/v1/chat/completions', async (route) => {
      requests.push(route.request().postData() ?? '');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ receta_id: responseId }) } }],
        }),
      });
    });
    await page.getByRole('button', { name: 'Plan', exact: true }).click();
    await page.getByRole('button', { name: 'Pedir sugerencia y validar' }).click();
    await expect(page.getByRole('status')).toContainText('Sugerencia validada');
    expect(requests[0]).not.toMatch(/peso|estatura|medicamentos|padecimientos|consentimiento/);
    responseId = 'inventada';
    await page.getByRole('button', { name: 'Pedir sugerencia y validar' }).click();
    await expect(page.getByRole('alert')).toContainText('No se pudo validar');
    await expect(
      page.getByRole('heading', { name: 'Arroz con huevo y tomate', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
    await page.getByRole('button', { name: 'Apagada', exact: true }).click();
    await expect(page.getByLabel('Clave propia', { exact: true })).toHaveValue('');
  });
});
test('desktop, crear tema y persistir', async ({ page }) => {
  page.on('pageerror', (e) => console.log('DESKTOP_PAGEERROR', e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('DESKTOP_CONSOLE', m.text());
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await onboard(page);
  await shot(page, '13-hoy-escritorio');
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await page.getByRole('button', { name: 'Crear tema · 4 colores' }).click();
  await page.getByRole('button', { name: 'Guardar tema', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-tema', 'personalizado');
  await expect(page.getByRole('status')).toContainText('Tu tema está guardado');
  await page.reload();
  await expect(page.getByTestId('streak')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-tema', 'personalizado');
});

test('capturas OLED para las slides con todas las pantallas principales', async ({ page }) => {
  await onboard(page);
  await page.getByRole('button', { name: /Elegir agua en una comida/ }).click();
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await page.getByLabel('Modo OLED').check();
  for (const [button, name] of [
    ['Hoy', '14-hoy-oled-pantalla'],
    ['Plan', '15-plan-oled-pantalla'],
    ['Progreso', '16-progreso-oled-pantalla'],
  ]) {
    await page.getByRole('button', { name: button, exact: true }).click();
    await page.screenshot({ path: `${shots}/${name}.png`, fullPage: false });
  }
  await page.getByRole('button', { name: 'Ver mi logro', exact: true }).click();
  await page.screenshot({ path: `${shots}/17-logro-oled-pantalla.png`, fullPage: false });
});

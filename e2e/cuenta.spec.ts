import { test, expect } from '@playwright/test';
import { esperarPortada, vigilarClaroEnRed } from './cuenta-helper';
import AxeBuilder from '@axe-core/playwright';

test.skip(!process.env['E2E_COMUNIDAD_URL'], 'Solo contra una instancia con la API de cuentas');

const aviso = '2026-11-11.6';

function usuario() {
  return 't' + Math.random().toString(36).slice(2, 10);
}

test('alta, sesión, sync entre 2 contextos, offline y borrado; axe en la pantalla de cuenta', async ({
  page,
  request,
  browser,
}) => {
  test.setTimeout(180000);
  const alias = usuario();
  const clave = 'secreto12';
  const verificarRed = vigilarClaroEnRed(page, clave);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Crea tu cuenta' })).toBeVisible();
  const axe = await new AxeBuilder({ page }).analyze();
  const graves = axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(graves, graves.map((v) => v.id).join(', ')).toEqual([]);

  await page.getByLabel('Alias').fill(alias);
  await page.getByLabel('Contraseña', { exact: true }).fill(clave);
  await page.getByLabel('Confirmo que tengo 18 años o más.').check();
  await page.getByLabel(/Acepto los términos/).check();
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByRole('heading', { name: 'Elige tu objetivo' })).toBeVisible();

  await page.getByRole('button', { name: 'Bajar de peso', exact: true }).click();
  await page.getByLabel('Acepto el uso local de mis datos').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  for (const name of ['Arroz blanco cocido', 'Huevo entero crudo', 'Jitomate rojo crudo'])
    await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('button', { name: 'Crear mi primer día' }).click();
  await page.getByRole('button', { name: 'Empezar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Hoy', exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.locator('html')).toHaveAttribute('data-sync', 'ok', { timeout: 20000 });

  const ctx2 = await browser.newContext();
  const page2 = await ctx2.newPage();
  const verificarRed2 = vigilarClaroEnRed(page2, clave);
  await page2.goto('/');
  await esperarPortada(page2);
  await page2.getByRole('tab', { name: 'Iniciar sesión' }).click();
  await page2.getByLabel('Alias').fill(alias);
  await page2.getByLabel('Contraseña', { exact: true }).fill(clave);
  await page2.getByRole('button', { name: 'Entrar' }).click();
  await expect(page2.getByRole('heading', { name: 'Hoy', exact: true })).toBeVisible({ timeout: 30000 });

  await page.context().setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Hoy', exact: true })).toBeVisible({ timeout: 15000 });
  await page.context().setOffline(false);

  await page.getByRole('button', { name: 'Ajustes' }).click();
  await page.getByRole('button', { name: 'Borrar todos mis datos' }).click();
  await page.getByRole('button', { name: 'Sí, borrar todo' }).click();
  await expect(page.getByRole('heading', { name: 'Crea tu cuenta' })).toBeVisible({ timeout: 15000 });

  const sales = await request.get('/api/progressium/cuenta/sales?usuario=' + alias);
  expect(sales.status()).toBe(200);
  const cuerpo = await sales.json();
  expect(cuerpo.salt_cuenta).toMatch(/^[a-f0-9]{32}$/);
  expect(cuerpo.salt_cifrado).toMatch(/^[a-f0-9]{32}$/);
  verificarRed();
  verificarRed2();
  await ctx2.close();
  expect(aviso).toBeTruthy();
});

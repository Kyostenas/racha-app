import { test, expect, Page } from '@playwright/test';
import { crearCuentaSiAparece, esperarPortada } from './cuenta-helper';
import { mkdir } from 'node:fs/promises';

// v0.4.4: catálogo mexicano sin crudo/cocido, recetas de la IA local y plan de 3 momentos.
const shots = process.env['E2E_CAPTURAS'] ?? 'docs/capturas';
const SEIS = ['Arroz blanco', 'Huevo entero', 'Jitomate rojo', 'Cebolla', 'Tortilla de maíz', 'Pechuga de pollo sin piel'];
async function shot(page: Page, name: string) {
  await mkdir(shots, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
}
async function elegir(page: Page, nombre: string) {
  await page.getByLabel('Buscar alimento').fill(nombre);
  await page.locator(`.chips.pantry button[title="${nombre}"]`).click();
}
async function onboard(page: Page, ingredientes: string[], opts: { alergia?: string; padecimiento?: string } = {}) {
  await page.goto('/');
  await esperarPortada(page);
  await crearCuentaSiAparece(page);
  await page.getByRole('button', { name: 'Mantener mi peso', exact: true }).click();
  await page.getByLabel('Acepto el uso local de mis datos').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  if (opts.alergia) await page.getByLabel('Alergias (separadas por coma)').fill(opts.alergia);
  if (opts.padecimiento) {
    await page.getByLabel('Acepto guardar padecimientos y medicamentos').check();
    await page.getByLabel('Padecimientos (opcional)').fill(opts.padecimiento);
  }
  for (const n of ingredientes) await elegir(page, n);
}
async function terminar(page: Page) {
  await page.getByRole('button', { name: 'Crear mi primer día' }).click();
  await page.getByRole('button', { name: 'Empezar', exact: true }).click();
}
async function opciones(page: Page) {
  return page.locator('#receta-seleccionada ~ label select option, label:has-text("Otras recetas disponibles") option').allTextContents();
}

test('despensa mexicana sin crudo/cocido y muchas recetas generadas', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await onboard(page, SEIS);
  for (const q of ['crudo', 'cocido', 'hervido'])  {
    await page.getByLabel('Buscar alimento').fill(q);
    await expect(page.locator('.chips.pantry button')).toHaveCount(0);
  }
  for (const nuevo of ['Queso Oaxaca', 'Chile poblano', 'Epazote', 'Nopales', 'Flor de jamaica']) {
    await page.getByLabel('Buscar alimento').fill(nuevo.split(' ').pop()!);
    await expect(page.locator(`.chips.pantry button[title="${nuevo}"]`)).toHaveCount(1);
  }
  await page.getByLabel('Buscar alimento').fill('arroz');
  await expect(page.locator('.chips.pantry button[title="Arroz blanco"]')).toHaveCount(1);
  await shot(page, 'v044-despensa');
  await terminar(page);

  // Hoy: comidas del día y comunidad.
  const hoy = page.getByTestId('comidas-hoy');
  await expect(hoy.locator('.meal-link')).toHaveCount(3);
  await expect(hoy).toContainText('Mañana · Desayuno');
  await expect(hoy).toContainText('Tarde · Comida');
  await expect(hoy).toContainText('Noche · Cena');
  await expect(page.getByTestId('comunidad-hoy').getByRole('heading', { name: 'Retos y novedades' })).toBeVisible();
  await expect(page.getByTestId('comunidad-hoy')).not.toContainText('Cargando comunidad');
  await shot(page, 'v044-hoy');
  const cena = await hoy.locator('.meal-link strong').nth(2).textContent();
  await hoy.locator('.meal-link').nth(2).click();
  await expect(page.locator('#receta-seleccionada h2')).toHaveText(cena!.trim());

  // Plan por día: 3 momentos, muchas opciones, etiqueta honesta.
  const plan = page.getByTestId('plan-dia');
  await expect(plan.locator('.meal')).toHaveCount(3);
  for (const m of ['desayuno', 'comida', 'cena']) await expect(plan.locator(`.meal[data-momento="${m}"] h3`)).toBeVisible();
  await expect(plan).toContainText('Generada por IA local · revisa antes de cocinar');
  const total = Number((await plan.textContent())!.match(/(\d+) recetas seguras/)![1]);
  expect(total).toBeGreaterThanOrEqual(20);
  expect((await opciones(page)).length).toBe(total);
  await shot(page, 'v044-plan-dia');
  const comida = plan.locator('.meal[data-momento="comida"] h3');
  const antes = await comida.textContent();
  await plan.locator('.meal[data-momento="comida"]').getByRole('button', { name: 'Otra opción' }).click();
  await expect(comida).not.toHaveText(antes!);
  await plan.getByRole('button', { name: 'Día siguiente' }).click();
  await expect(plan.getByRole('heading', { name: /Mañana: mañana, tarde y noche/ })).toBeVisible();
  await plan.locator('.meal[data-momento="desayuno"]').getByRole('button', { name: 'Ver receta' }).click();
  await expect(page.locator('#receta-seleccionada .eyebrow')).toContainText(/Generada por IA local|Receta curada/);

  // Comunidad desde Hoy.
  await page.getByRole('button', { name: 'Hoy', exact: true }).click();
  await page.getByTestId('comunidad-hoy').getByRole('button', { name: 'Ir a Comunidad' }).click();
  await expect(page.getByRole('heading', { name: 'Comunidad', level: 1 })).toBeVisible();
  expect(errors).toEqual([]);
});

test('alergia y padecimiento bloquean recetas no seguras', async ({ page }) => {
  await onboard(page, [...SEIS, 'Chorizo de cerdo', 'Jamón de cerdo'], { alergia: 'huevo', padecimiento: 'hipertensión' });
  await terminar(page);
  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  await expect(page.getByTestId('aviso-salud')).toContainText('sodio');
  const plan = page.getByTestId('plan-dia');
  await expect(plan.locator('.meal')).toHaveCount(3);
  const ops = await opciones(page);
  expect(ops.length).toBeGreaterThan(3);
  expect(ops.filter((o) => /huevo|chorizo|jam[oó]n/i.test(o))).toEqual([]);
  await expect(page.locator('#receta-seleccionada .ingredients')).not.toContainText(/Huevo|Chorizo|Jamón/);
  await shot(page, 'v044-seguridad');
});

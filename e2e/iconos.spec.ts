import { test, expect, Page } from '@playwright/test';
import { crearCuentaSiAparece, esperarPortada } from './cuenta-helper';
import { mkdir } from 'node:fs/promises';

// v0.4.5: ningún ícono debe verse como texto («sk» en vez de la sartén). Con la ligadura aplicada,
// cada .material-symbols-sharp mide 1em; si el nombre no existe o una regla CSS le cambia la fuente,
// el texto crudo desborda la caja (overflow: hidden) y scrollWidth > clientWidth.
const shots = process.env['E2E_CAPTURAS'] ?? 'docs/capturas';

async function iconosRotos(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.material-symbols-sharp')]
      .filter((el) => el.clientWidth > 0)
      .map((el) => ({
        nombre: el.textContent!.trim(),
        fuente: getComputedStyle(el).fontFamily,
        ancho: el.clientWidth,
        contenido: el.scrollWidth,
      }))
      .filter((i) => !i.fuente.startsWith('"Material Symbols Sharp"') || i.contenido > i.ancho + 1),
  );
}

test('todas las pantallas muestran íconos, no su nombre', async ({ page }) => {
  await page.goto('/');
  await esperarPortada(page);
  await crearCuentaSiAparece(page);
  await page.getByRole('button', { name: 'Mantener mi peso', exact: true }).click();
  await page.getByLabel('Acepto el uso local de mis datos').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  for (const n of ['Huevo entero', 'Jitomate rojo', 'Cebolla', 'Tortilla de maíz', 'Arroz blanco']) {
    await page.getByLabel('Buscar alimento').fill(n);
    await page.locator(`.chips.pantry button[title="${n}"]`).click();
  }
  expect(await iconosRotos(page), 'Despensa (alta)').toEqual([]);
  await page.getByRole('button', { name: 'Crear mi primer día' }).click();
  expect(await iconosRotos(page), 'Primer día').toEqual([]);
  await page.getByRole('button', { name: 'Empezar', exact: true }).click();

  for (const pantalla of ['Hoy', 'Plan', 'Progreso', 'Comunidad', 'Ajustes']) {
    await page.locator('.bottom-nav').getByRole('button', { name: pantalla, exact: true }).click();
    await expect(page.locator('.bottom-nav button.active')).toContainText(pantalla);
    expect(await iconosRotos(page), pantalla).toEqual([]);
  }

  // Arte de la receta: ícono según el momento, presente en la fuente y no recortado.
  await page.locator('.bottom-nav').getByRole('button', { name: 'Plan', exact: true }).click();
  const plan = page.getByTestId('plan-dia');
  const iconos = { desayuno: 'egg_alt', comida: 'skillet', cena: 'dinner_dining' } as const;
  for (const [m, icono] of Object.entries(iconos)) {
    const ver = plan.locator(`.meal[data-momento="${m}"]`).getByRole('button', { name: 'Ver receta' });
    if ((await ver.count()) === 0) continue;
    await ver.click();
    const arte = page.locator('#receta-seleccionada .recipe-art');
    await expect(arte).toHaveAttribute('data-momento', /desayuno|comida|cena/);
    const momento = (await arte.getAttribute('data-momento')) as keyof typeof iconos;
    await expect(arte.locator('.material-symbols-sharp')).toHaveText(iconos[momento]);
    await expect(arte.locator('.recipe-art-label')).toBeVisible();
    expect(await iconosRotos(page), `Receta de ${m}`).toEqual([]);
  }
  await mkdir(shots, { recursive: true });
  await page.locator('#receta-seleccionada').screenshot({ path: `${shots}/v045-receta-icono.png` });
});

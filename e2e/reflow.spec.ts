import { test, expect, Page } from '@playwright/test';
import { crearCuentaSiAparece } from './cuenta-helper';

// WCAG 1.4.4 y 1.4.10: a 320 px de ancho y con la letra al 200 % no debe haber scroll horizontal
// en la página (la barra inferior puede desplazarse dentro de sí misma).
test.use({ viewport: { width: 320, height: 640 } });

async function letraAl200(page: Page) {
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const s = document.createElement('style');
      s.textContent = 'html { font-size: 200% !important; }';
      document.head.appendChild(s);
    });
  });
}

async function sinScrollHorizontal(page: Page, donde: string) {
  await page.evaluate(() => document.fonts.ready);
  const r = await page.evaluate(() => {
    const ancho = document.documentElement.clientWidth;
    const fuera = [...document.querySelectorAll('body *')]
      .filter((e) => !e.closest('.bottom-nav'))
      .filter((e) => {
        const b = e.getBoundingClientRect();
        return b.width > 0 && b.right > ancho + 0.5;
      })
      .slice(0, 5)
      .map((e) => `${e.tagName.toLowerCase()}.${[...e.classList].join('.')}`);
    return { ancho, scroll: document.documentElement.scrollWidth, letra: getComputedStyle(document.documentElement).fontSize, fuera };
  });
  expect(r.letra, donde).toBe('32px');
  expect({ donde, scroll: r.scroll, fuera: r.fuera }).toEqual({ donde, scroll: r.ancho, fuera: [] });
}

test('reflow a 320 px con letra al 200 %: ninguna pantalla se sale de lado', async ({ page }) => {
  await letraAl200(page);
  await page.goto('/');
  if (await page.getByRole('heading', { name: 'Crea tu cuenta' }).count()) {
    await sinScrollHorizontal(page, 'cuenta');
    const alias = await crearCuentaSiAparece(page);
    expect(alias).toBeTruthy();
  }
  await expect(page.getByRole('heading', { name: 'Elige tu objetivo' })).toBeVisible();
  await sinScrollHorizontal(page, 'objetivo');
  await page.getByRole('button', { name: 'Bajar de peso', exact: true }).click();
  await page.getByLabel('Acepto el uso local de mis datos').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await sinScrollHorizontal(page, 'lo mínimo');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await sinScrollHorizontal(page, 'alimentos');
  for (const name of ['Arroz blanco cocido', 'Huevo entero crudo', 'Jitomate rojo crudo'])
    await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('button', { name: 'Crear mi primer día' }).click();
  await sinScrollHorizontal(page, 'primer día');
  await page.getByRole('button', { name: 'Empezar', exact: true }).click();
  await sinScrollHorizontal(page, 'hoy');
  const nav = page.getByRole('navigation', { name: 'Navegación principal' });
  for (const destino of ['Plan', 'Progreso', 'Ajustes', 'Comunidad', 'Hoy']) {
    const boton = nav.getByRole('button', { name: destino, exact: true });
    await boton.scrollIntoViewIfNeeded();
    await boton.click();
    await sinScrollHorizontal(page, destino);
  }
  // Las etiquetas de la barra no se parten a media palabra.
  for (const b of await nav.getByRole('button').all()) {
    const lineas = await b.evaluate((el) => {
      const texto = [...el.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim()).pop()!;
      const r = document.createRange();
      r.selectNodeContents(texto);
      return new Set([...r.getClientRects()].filter((x) => x.width > 1).map((x) => Math.round(x.top))).size;
    });
    expect(lineas).toBe(1); // la etiqueta queda en una sola línea
  }
  // Con la comunidad activa (solo contra una instancia con API).
  if (process.env['E2E_COMUNIDAD_URL']) {
    await nav.getByRole('button', { name: 'Comunidad', exact: true }).click();
    await page.getByLabel('Confirmo que tengo 18 años o más.').check();
    await page.getByLabel(/compartir los datos de salud que yo active/).check();
    await page.getByRole('button', { name: 'Activar comunidad' }).click();
    await expect(page.getByRole('heading', { name: /Tu alias:/ })).toBeVisible();
    for (const c of await page.getByRole('group', { name: /Interruptores/ }).getByRole('checkbox').all()) await c.check();
    await sinScrollHorizontal(page, 'comunidad activa');
    await page.getByRole('button', { name: 'Borrar mi cuenta de la comunidad' }).click();
    await page.getByRole('button', { name: 'Sí, borrar todo' }).click();
  }
});

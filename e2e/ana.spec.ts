import { defaultSettings } from '../src/app/domain';
import { test, expect, Page } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
const shots = 'docs/capturas';
async function shot(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
}
async function onboard(page: Page, allergy = '') {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Elige tu objetivo' })).toBeVisible();
  await page.getByRole('button', { name: 'Bajar de peso', exact: true }).click();
  await page.getByLabel('Acepto el uso local de mis datos').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  if (allergy) await page.getByLabel('Alergias (separadas por coma)').fill(allergy);
  for (const name of ['Arroz blanco cocido', 'Huevo entero crudo', 'Jitomate rojo crudo'])
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
  await expect(page.getByRole('heading', { name: 'Elige tu objetivo' })).toBeVisible();
  await shot(page, '01-intencion');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('alert')).toContainText('Acepta');
  await page.getByRole('button', { name: 'Bajar de peso', exact: true }).click();
  await page.getByLabel('Acepto el uso local de mis datos').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await shot(page, '02-lo-minimo');
  await page.getByLabel('Edad (años)').fill('17');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('alert')).toContainText('adultos');
  await page.getByLabel('Edad (años)').fill('21');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByLabel('Padecimientos (opcional)')).toHaveCount(0);
  for (const name of ['Arroz blanco cocido', 'Huevo entero crudo', 'Jitomate rojo crudo'])
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
    page.getByRole('heading', { name: 'Arroz con huevo y jitomate', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Fuentes y método' })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'USDA · Arroz blanco de grano largo enriquecido cocido ↗' }),
  ).toHaveAttribute('href', /168878/);
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
  expect(download.suggestedFilename()).toBe('progressium-logro.png');
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
  await page.getByRole('button', { name: 'Progressium', exact: true }).click();
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
  const cachedPaths = await page.evaluate(async () => {
    const paths: string[] = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const key of await cache.keys()) paths.push(new URL(key.url).pathname);
    }
    return paths;
  });
  expect(cachedPaths.some((path) => path.includes('/catalogo/'))).toBe(false);
  expect(cachedPaths.filter((path) => path.endsWith('/data/alimentos.json'))).toHaveLength(1);
  expect(cachedPaths.filter((path) => path.endsWith('/data/ejercicios.json'))).toHaveLength(1);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('streak')).toContainText('1');
  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Arroz con huevo y jitomate', exact: true }),
  ).toBeVisible();
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await page.getByRole('button', { name: 'Borrar todos mis datos', exact: true }).click();
  await page.getByRole('button', { name: 'Sí, borrar todo', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Elige tu objetivo' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Elige tu objetivo' })).toBeVisible();
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
    await page.getByText('Detalles', { exact: true }).click();
    await page.getByLabel('Dirección del servicio').fill('https://proveedor.example/v1');
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
      page.getByRole('heading', { name: 'Arroz con huevo y jitomate', exact: true }),
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
  await page.getByRole('button', { name: 'Crear tema', exact: true }).click();
  await page.getByLabel('Nombre del tema').fill('Tema de prueba');
  await page.getByRole('button', { name: 'Guardar y usar', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-tema', /custom:/);
  await expect(page.getByRole('status')).toContainText('Tema guardado');
  await page.reload();
  await expect(page.getByTestId('streak')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-tema', /custom:/);
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

test('datos locales corruptos: recuperación explícita sin bloquear el inicio', async ({ page }) => {
  await onboard(page);
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('racha', 3);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('ajustes', 'readwrite');
          tx.objectStore('ajustes').put({ id: 'local', tema: 42 });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('formato esperado');
  await page.getByRole('button', { name: 'Borrar datos locales e intentar de nuevo' }).click();
  await expect(page.getByRole('heading', { name: 'Elige tu objetivo' })).toBeVisible();
});

for (const width of [320, 412]) {
  test(`UX móvil ${width}: lenguaje claro, nombres completos y barras sin obstruir`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 820 });
    await onboard(page);
    await page.getByRole('button', { name: 'Plan', exact: true }).click();
    const full = 'Tortilla de harina de trigo refrigerada lista para calentar';
    await page.getByLabel('Buscar en catálogo').fill('Tortilla de harina');
    const chip = page.getByTitle(full, { exact: true });
    await expect(chip).toBeVisible();
    expect((await chip.innerText()).length).toBeLessThanOrEqual(44);
    await chip.click();
    await expect(
      page.locator('.food-detail').getByRole('heading', { name: full, exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
    await page.getByRole('button', { name: 'Avanzado › IA' }).click();
    await expect(
      page.getByText('Tu clave se guarda solo en este teléfono, sin candado.', { exact: false }),
    ).toBeVisible();
    const local = page.getByRole('button', { name: 'En tu cel · Próximamente', exact: true });
    await expect(local).toBeDisabled();
    expect(await local.evaluate((e) => getComputedStyle(e).textTransform)).toBe('none');
    expect(
      await local.evaluate(
        (e) => e.scrollWidth <= e.clientWidth + 1 && e.scrollHeight <= e.clientHeight + 1,
      ),
    ).toBe(true);
    await expect(
      page.getByText('Compatible con el formato OpenAI.', { exact: false }),
    ).not.toBeVisible();
    await expect(page.getByLabel('Dirección del servicio')).not.toBeVisible();
    await expect(page.locator('.danger')).toContainText('en este teléfono o computadora');
    await expect(page.locator('.danger')).not.toContainText('IndexedDB');
    for (const locator of [
      page.getByRole('button', { name: 'Guardar y activar clave propia' }),
      page.getByRole('button', { name: 'Borrar todos mis datos', exact: true }),
    ]) {
      await locator.focus();
      await locator.evaluate((e) => e.scrollIntoView({ block: 'center' }));
      const visible = await locator.evaluate((e) => {
        const r = e.getBoundingClientRect();
        const nav = document.querySelector('.bottom-nav')?.getBoundingClientRect();
        const note = document.querySelector('.medical-note')?.getBoundingClientRect();
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return (
          !!nav && !!note && r.bottom <= nav.top && r.top >= note.bottom && !!hit && e.contains(hit)
        );
      });
      expect(visible).toBe(true);
    }
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    expect(
      await page.locator('footer').evaluate((e) => {
        const bar = document.querySelector('.bottom-nav')?.getBoundingClientRect();
        return !!bar && e.getBoundingClientRect().bottom <= bar.top - 16;
      }),
    ).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page
      .getByRole('button', { name: 'Guardar y activar clave propia' })
      .evaluate((e) => e.scrollIntoView({ block: 'center' }));
    await page.screenshot({ path: `${shots}/ux-ajustes-${width}.png`, fullPage: false });
  });
}
test('onboarding, despensa y primer día en OLED', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('heading', { name: 'Elige tu objetivo' }).waitFor();
  await page.evaluate(
    (settings) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('racha', 3);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('ajustes', 'readwrite');
          tx.objectStore('ajustes').put(settings);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    { ...defaultSettings, oled: true },
  );
  await page.reload();
  await page.getByRole('heading', { name: 'Elige tu objetivo' }).waitFor();
  await expect(page.locator('html')).toHaveAttribute('data-oled', '');
  await shot(page, '19-onboarding-oled');
  await page.getByLabel('Acepto el uso local de mis datos').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(
    page.getByText('Si no reconocemos una alergia, bloqueamos las recetas.', { exact: false }),
  ).toBeVisible();
  for (const name of ['Arroz blanco cocido', 'Huevo entero crudo', 'Jitomate rojo crudo'])
    await page.getByRole('button', { name, exact: true }).click();
  await shot(page, '20-despensa-oled');
  await page.getByRole('button', { name: 'Crear mi primer día' }).click();
  await page.getByRole('heading', { name: 'Tu primer día.' }).waitFor();
  await shot(page, '21-primer-dia-oled');
});

test('despensa clara: nombre español coherente y fuente externa sin descripción inglesa', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('heading', { name: 'Elige tu objetivo' }).waitFor();
  await page.getByLabel('Acepto el uso local de mis datos').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  for (const name of ['Arroz blanco cocido', 'Huevo entero crudo', 'Jitomate rojo crudo'])
    await page.getByRole('button', { name, exact: true }).click();
  const detail = page.locator('.food-detail');
  await expect(
    detail.getByRole('heading', { name: 'Jitomate rojo crudo', exact: true }),
  ).toBeVisible();
  await expect(detail).not.toContainText(/Tomatoes|year round|nombreOriginal/);
  await expect(detail.getByRole('link', { name: 'Ver fuente del alimento ↗' })).toHaveAttribute(
    'href',
    'https://fdc.nal.usda.gov/food-details/170457/nutrients',
  );
  await shot(page, '20-despensa');
});

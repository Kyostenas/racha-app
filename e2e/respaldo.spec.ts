import { test, expect, Page } from '@playwright/test';
import { crearCuentaSiAparece, esperarPortada, vigilarClaroEnRed } from './cuenta-helper';
import { mkdir } from 'node:fs/promises';

// v0.4.7: respaldo de datos locales en el servidor (manual, diario a una hora y restauración).
const shots = process.env['E2E_CAPTURAS'] ?? 'docs/capturas';
const conServidor = !!process.env['E2E_COMUNIDAD_URL'];

async function onboard(page: Page) {
  await page.getByRole('button', { name: 'Mantener mi peso', exact: true }).click();
  await page.getByLabel('Acepto el uso local de mis datos').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  for (const n of ['Arroz blanco', 'Huevo entero', 'Jitomate rojo']) {
    await page.getByLabel('Buscar alimento').fill(n);
    await page.locator(`.chips.pantry button[title="${n}"]`).click();
  }
  await page.getByRole('button', { name: 'Crear mi primer día' }).click();
  await page.getByRole('button', { name: 'Empezar', exact: true }).click();
}
async function ajustes(page: Page) {
  await page.locator('.bottom-nav').getByRole('button', { name: 'Ajustes', exact: true }).click();
  return page.getByTestId('respaldo');
}
/** Lee o modifica IndexedDB directo (sin pasar por la app, así no dispara la sincronización). */
function idb<T>(page: Page, fn: string, arg?: unknown): Promise<T> {
  return page.evaluate(
    async ([fn, arg]) => {
      const db = await new Promise<IDBDatabase>((ok, ko) => {
        const r = indexedDB.open('racha');
        r.onsuccess = () => ok(r.result);
        r.onerror = () => ko(r.error);
      });
      const get = (s: string, id: string) =>
        new Promise<any>((ok) => {
          const r = db.transaction(s).objectStore(s).get(id);
          r.onsuccess = () => ok(r.result);
        });
      const put = (s: string, v: unknown) =>
        new Promise<void>((ok) => {
          const tx = db.transaction(s, 'readwrite');
          tx.objectStore(s).put(v);
          tx.oncomplete = () => ok();
        });
      const r = await new Function('get', 'put', 'arg', `return (async () => { ${fn} })()`)(get, put, arg);
      db.close();
      return r;
    },
    [fn, arg] as const,
  ) as Promise<T>;
}

test('sin cuenta, Ajustes invita a crear una para respaldar', async ({ page }) => {
  test.skip(conServidor, 'Sin servidor la app no pide cuenta');
  await page.goto('/');
  await esperarPortada(page);
  await onboard(page);
  const r = await ajustes(page);
  await expect(r.getByRole('heading', { name: 'Respaldo de datos locales en el servidor' })).toBeVisible();
  await expect(r.getByRole('button', { name: 'Crear cuenta para respaldar' })).toBeVisible();
  await expect(r.getByRole('button', { name: 'Respaldar ahora' })).toHaveCount(0);
});

test('respaldar ahora, programar a una hora, respaldo pendiente al abrir y restaurar', async ({ page }) => {
  test.skip(!conServidor, 'Solo contra una instancia con la API de cuentas');
  test.setTimeout(180000);
  const subidas: string[] = [];
  page.on('request', (req) => {
    if (req.method() === 'PUT' && req.url().endsWith('/api/progressium/sync')) subidas.push(req.postData() ?? '');
  });
  const verificarRed = vigilarClaroEnRed(page, 'secreto12');
  await page.goto('/');
  await esperarPortada(page);
  const alias = await crearCuentaSiAparece(page);
  expect(alias).toBeTruthy();
  try {
    await onboard(page);
    await expect(page.locator('html')).toHaveAttribute('data-sync', 'ok', { timeout: 20000 });
    const r = await ajustes(page);
    const estado = r.getByTestId('respaldo-estado');

    // (a) Manual: estado con fecha y OK.
    const subida = page.waitForResponse((res) => res.request().method() === 'PUT' && res.url().endsWith('/api/progressium/sync'));
    await r.getByRole('button', { name: 'Respaldar ahora' }).click();
    expect((await subida).status()).toBe(200);
    await expect(page.getByText('Respaldo cifrado guardado en el servidor.')).toBeVisible();
    await expect(estado).toContainText('OK');
    await expect(estado).not.toContainText('nunca');
    for (const body of subidas) {
      const b = JSON.parse(body);
      expect(b.datos_cifrados).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
      expect(body).not.toMatch(/despensa|arroz|huevo|mantener/i);
    }

    // (b) Programado: on + hora; persiste al recargar (la llave queda en el dispositivo).
    await r.getByLabel('Respaldar todos los días').check();
    await r.getByLabel('Hora').fill('00:00');
    await r.getByLabel('Hora').dispatchEvent('change');
    await expect(r.getByTestId('respaldo-explicacion')).toContainText('al abrir Progressium');
    await expect.poll(() => idb<any>(page, `return get('cuenta','respaldo')`)).toMatchObject({ activo: true, hora: '00:00' });
    await mkdir(shots, { recursive: true });
    await r.screenshot({ path: `${shots}/v047-respaldo.png` });

    // Respaldo pendiente: el último fue ayer → al abrir la app se respalda solo.
    await idb(page, `const c = await get('cuenta','respaldo'); await put('cuenta', { ...c, ultimoOk: new Date(Date.now() - 864e5).toISOString(), ultimoIntento: null, resultado: 'ok' });`);
    const previas = subidas.length;
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Hoy', exact: true })).toBeVisible({ timeout: 20000 });
    await expect
      .poll(() => idb<any>(page, `return get('cuenta','respaldo')`), { timeout: 20000 })
      .toMatchObject({ origen: 'programado', resultado: 'ok' });
    expect(subidas.length).toBeGreaterThan(previas);
    const r2 = await ajustes(page);
    await expect(r2.getByLabel('Respaldar todos los días')).toBeChecked();
    await expect(r2.getByLabel('Hora')).toHaveValue('00:00');
    await expect(r2.getByRole('button', { name: 'Respaldar ahora' })).toBeVisible();

    // (c) Restaurar con confirmación: un cambio local que no se respaldó se revierte.
    await idb(page, `const a = await get('ajustes','local'); await put('ajustes', { ...a, tema: 'cambio-sin-respaldo' });`);
    await r2.getByRole('button', { name: 'Restaurar desde el respaldo' }).click();
    await expect(page.getByRole('dialog')).toContainText('Se reemplazan los datos de este dispositivo');
    await page.getByRole('button', { name: 'Cancelar' }).click();
    expect((await idb<any>(page, `return get('ajustes','local')`)).tema).toBe('cambio-sin-respaldo');
    await r2.getByRole('button', { name: 'Restaurar desde el respaldo' }).click();
    await page.getByRole('button', { name: 'Sí, restaurar' }).click();
    await expect(page.getByText(/Datos restaurados del respaldo/)).toBeVisible({ timeout: 20000 });
    expect((await idb<any>(page, `return get('ajustes','local')`)).tema).not.toBe('cambio-sin-respaldo');
    verificarRed();
  } finally {
    await ajustes(page);
    await page.getByRole('button', { name: 'Borrar todos mis datos' }).click();
    await page.getByRole('button', { name: 'Sí, borrar todo' }).click();
    await expect(page.getByRole('heading', { name: 'Crea tu cuenta' })).toBeVisible({ timeout: 15000 });
  }
});

import { test, expect, Page, APIRequestContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomBytes } from 'node:crypto';
import { mkdir } from 'node:fs/promises';

// Necesita una instancia real (imagen Docker): E2E_COMUNIDAD_URL=http://127.0.0.1:8090
test.skip(!process.env['E2E_COMUNIDAD_URL'], 'Solo contra una instancia con la API de la comunidad');

const AVISO = '2026-11-11.2';
const PROHIBIDOS = ['peso', 'estatura', 'edad', 'padecimientos', 'medicamentos', 'alergias', 'nombre', 'email'];

async function semilla(request: APIRequestContext, semana: string) {
  const clave = randomBytes(32).toString('hex');
  const alta = await request.post('/api/progressium/alta', {
    data: { clave, mayor_de_edad: true, consentimiento: { acepto: true, version_aviso: AVISO } },
  });
  expect(alta.ok()).toBeTruthy();
  const { usuario, alias, id } = await alta.json();
  const login = await request.post('/api/collections/usuarios/auth-with-password', { data: { identity: usuario, password: clave } });
  const token = (await login.json()).token as string;
  const headers = { authorization: token };
  const visibles = { intencion: true, imc_cat: true, edad_rango: true, progreso: true };
  expect((await request.put('/api/progressium/perfil', { headers, data: { visibles, intencion: 'bajar', imc_cat: 'normal', edad_rango: '18-24' } })).ok()).toBeTruthy();
  expect((await request.put('/api/progressium/semana', { headers, data: { semana, pct_habitos: 40, racha: 3 } })).ok()).toBeTruthy();
  return { id, alias, headers, usuario, clave };
}

function semanaISO(f: Date) {
  const d = new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate()));
  const dia = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dia);
  const ini = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return `${d.getUTCFullYear()}-W${String(Math.ceil(((d.getTime() - ini.getTime()) / 86400000 + 1) / 7)).padStart(2, '0')}`;
}

async function onboard(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Elige tu objetivo' })).toBeVisible();
  await page.getByRole('button', { name: 'Bajar de peso', exact: true }).click();
  await page.getByLabel('Acepto el uso local de mis datos').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  for (const name of ['Arroz blanco cocido', 'Huevo entero crudo', 'Jitomate rojo crudo'])
    await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('button', { name: 'Crear mi primer día' }).click();
  await page.getByRole('button', { name: 'Empezar', exact: true }).click();
}

async function sinViolaciones(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  const graves = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(graves.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

test('comunidad: opt-in, todo apagado, match k≥5, conexión, reto, exportar y borrar', async ({ page, request }) => {
  await mkdir('docs/capturas', { recursive: true });
  const errores: string[] = [];
  page.on('pageerror', (e) => errores.push(e.message));
  const semana = semanaISO(new Date());
  const semillas = [];
  for (let i = 0; i < 4; i++) semillas.push(await semilla(request, semana));

  // La PWA viene de la misma instancia y es instalable.
  await page.goto('/');
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
  await onboard(page);
  await page.getByRole('button', { name: 'Comunidad', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Comunidad', level: 1 })).toBeVisible();
  await expect(page.getByText('Nada, hasta que tú lo actives.')).toBeVisible();
  await sinViolaciones(page);
  await page.screenshot({ path: 'docs/capturas/comunidad-1-optin.png', fullPage: true });

  // Sin confirmar mayoría de edad y consentimiento no se activa.
  await page.getByRole('button', { name: 'Activar comunidad' }).click();
  await expect(page.getByRole('alert')).toContainText('18 años');

  const cuerpos: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/') && r.postData()) cuerpos.push(r.postData()!);
  });
  await page.getByLabel('Confirmo que tengo 18 años o más.').check();
  await page.getByLabel(/Doy mi consentimiento expreso/).check();
  await page.getByRole('button', { name: 'Activar comunidad' }).click();
  await expect(page.getByRole('heading', { name: /Tu alias:/ })).toBeVisible();
  // Todos los interruptores empiezan apagados.
  const interruptores = page.getByRole('group', { name: /Interruptores/ }).getByRole('checkbox');
  await expect(interruptores).toHaveCount(8);
  for (const c of await interruptores.all()) await expect(c).not.toBeChecked();
  await expect(page.getByText('Todavía no hay suficientes personas parecidas', { exact: false }).first()).toBeVisible();

  await page.getByLabel('Mi objetivo (bajar, mantener o subir)').check();
  await page.getByLabel('Mi edad en rango de 5 años').check();
  await page.getByLabel('Mi categoría de IMC (no mi peso)').check();
  await page.getByLabel('Mi progreso semanal (% de hábitos y racha)').check();
  await page.getByRole('button', { name: 'Guardar lo que comparto' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Compartes 4 de 8' })).toBeVisible();

  // Cambio de peso: interruptor propio, apagado, con consentimiento expreso aparte y solo en rangos.
  const pesoSwitch = page.getByLabel(/Mi cambio de peso en rangos de 1 %/);
  await expect(pesoSwitch).not.toBeChecked();
  await pesoSwitch.check();
  const consientoPeso = page.getByLabel(/compartir mi cambio de peso en rangos\./);
  await expect(consientoPeso).not.toBeChecked();
  await page.getByRole('button', { name: 'Guardar lo que comparto' }).click();
  await expect(page.getByRole('alert')).toContainText('consentimiento expreso');
  await consientoPeso.check();
  await sinViolaciones(page);
  await page.getByRole('button', { name: 'Guardar lo que comparto' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Compartes 5 de 8' })).toBeVisible();
  await expect(consientoPeso).toHaveCount(0); // ya consentido: no se vuelve a pedir
  // Peso de la semana pasada (solo local) y de esta: al servidor va el rango, nunca el número.
  const semanaPasada = semanaISO(new Date(Date.now() - 7 * 86400000));
  await page.evaluate(
    (sem) =>
      new Promise<void>((ok, mal) => {
        const r = indexedDB.open('racha');
        r.onsuccess = () => {
          const st = r.result.transaction('comunidad', 'readwrite').objectStore('comunidad');
          const g = st.get('local');
          g.onsuccess = () => {
            const v = g.result;
            v.pesos = { ...v.pesos, [sem]: 81.1 };
            const p = st.put(v);
            p.onsuccess = () => ok();
            p.onerror = () => mal(p.error);
          };
        };
      }),
    semanaPasada,
  );
  await page.reload();
  await page.getByRole('button', { name: 'Comunidad', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Tu alias:/ })).toBeVisible();
  const subida = page.waitForRequest((r) => r.url().endsWith('/api/progressium/semana') && (r.postData() ?? '').includes('cambio_peso_rango'));
  await page.getByLabel('Peso (kg)').fill('80');
  await page.getByRole('button', { name: 'Guardar peso' }).click();
  const enviado = JSON.parse((await subida).postData()!);
  expect(enviado.cambio_peso_rango).toBe('-2..-1%'); // 81.1 → 80 kg = -1.36 %
  expect(Object.keys(enviado)).not.toContain('cambio_peso_pct');
  // El servidor rechaza un número exacto aunque el interruptor esté activo.
  const yo = await page.evaluate(
    () =>
      new Promise<{ usuario: string; clave: string }>((ok) => {
        const r = indexedDB.open('racha');
        r.onsuccess = () => {
          const g = r.result.transaction('comunidad').objectStore('comunidad').get('local');
          g.onsuccess = () => ok(g.result);
        };
      }),
  );
  const auth = await request.post('/api/collections/usuarios/auth-with-password', { data: { identity: yo.usuario, password: yo.clave } });
  const miToken = (await auth.json()).token as string;
  for (const malo of [{ cambio_peso_rango: -1.36 }, { cambio_peso_rango: '-1.36%' }, { cambio_peso_pct: -1.5 }]) {
    const r = await request.put('/api/progressium/semana', { headers: { authorization: miToken }, data: { semana, pct_habitos: 10, racha: 1, ...malo } });
    expect(r.status(), JSON.stringify(malo)).toBe(400);
  }

  // Ningún cuerpo enviado lleva datos prohibidos (solo la clave anónima en el alta/login).
  for (const c of cuerpos) {
    const o = JSON.parse(c);
    expect(Object.keys(o)).not.toContain('cambio_peso_pct');
    for (const k of PROHIBIDOS) expect(Object.keys(o)).not.toContain(k);
    expect(c).not.toMatch(/"(peso|estatura|edad|padecimientos|medicamentos|alergias)"\s*:/);
  }

  // Con 5 personas parecidas aparece el match y la comparación.
  const lista = page.getByRole('region', { name: 'Personas parecidas' });
  await expect(lista.getByRole('button', { name: `Conectar con ${semillas[0].alias}` })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Tu grupo parecido' })).toContainText('Hábitos: estás por encima');
  await sinViolaciones(page);
  await page.screenshot({ path: 'docs/capturas/comunidad-2-match.png', fullPage: true });

  await lista.getByRole('button', { name: `Conectar con ${semillas[0].alias}` }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Solicitud enviada' })).toBeVisible();
  const conexiones = await (await request.get('/api/progressium/conexiones', { headers: semillas[0].headers })).json();
  const pendiente = conexiones.conexiones.find((c: { estado: string }) => c.estado === 'solicitada');
  expect((await request.patch(`/api/progressium/conexiones/${pendiente.id}`, { headers: semillas[0].headers, data: { estado: 'aceptada' } })).ok()).toBeTruthy();

  // Retos: completar uno publica un evento en novedades.
  await page.getByRole('button', { name: 'Unirme a 3 días de fuerza' }).click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Sumar un día a 3 días de fuerza' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Completaste' })).toBeVisible();
  const feed = page.getByRole('region', { name: 'Novedades' });
  await expect(feed).toContainText('completó el reto «3 días de fuerza»');
  const conexion = page.getByRole('region', { name: 'Conexiones' });
  await conexion.getByRole('button', { name: `Ver progreso de ${semillas[0].alias}` }).click();
  await expect(conexion).toContainText('40 % de hábitos');
  await sinViolaciones(page);
  await page.screenshot({ path: 'docs/capturas/comunidad-3-retos.png', fullPage: true });

  // Exportar descarga un JSON.
  const descarga = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar mis datos (JSON)' }).click();
  expect((await descarga).suggestedFilename()).toMatch(/^progressium-comunidad-.*\.json$/);

  // Borrar cuenta: vuelve a la pantalla de opt-in y la clave ya no sirve.
  const local = await page.evaluate(
    () =>
      new Promise<{ usuario: string; clave: string }>((ok) => {
        const r = indexedDB.open('racha');
        r.onsuccess = () => {
          const g = r.result.transaction('comunidad').objectStore('comunidad').get('local');
          g.onsuccess = () => ok(g.result);
        };
      }),
  );
  await page.getByRole('button', { name: 'Borrar mi cuenta de la comunidad' }).click();
  await page.getByRole('button', { name: 'Sí, borrar todo' }).click();
  await expect(page.getByRole('button', { name: 'Activar comunidad' })).toBeVisible();
  const login = await request.post('/api/collections/usuarios/auth-with-password', { data: { identity: local.usuario, password: local.clave } });
  expect(login.status()).toBe(400);
  expect(errores).toEqual([]);
});

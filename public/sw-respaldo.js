/* Service worker de Progressium: el de Angular (ngsw) más el respaldo en segundo plano.
 * Si el navegador ofrece Periodic Background Sync (Chrome con la app instalada), hace el respaldo
 * programado aunque la app esté cerrada. Repite la regla de src/app/cuenta/respaldo-programa.ts
 * y el formato de cifrar() de src/app/cuenta/crypto.ts: AES-GCM con la llave no extraíble
 * guardada en IndexedDB. Al servidor solo viaja el paquete cifrado «v1.iv.ct». */
importScripts('./ngsw-worker.js');

const TAG = 'progressium-respaldo';
const STORES_SYNC = ['perfil', 'hábitos', 'rachas', 'registros', 'ajustes', 'temasPersonalizados', 'comunidad'];
const REINTENTO_MS = 15 * 60 * 1000;

self.addEventListener('periodicsync', (event) => {
  if (event.tag === TAG) event.waitUntil(respaldoEnSegundoPlano().catch(() => undefined));
});

function pedido(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function leer(db, store, id) {
  return pedido(db.transaction(store).objectStore(store).get(id));
}
function todos(db, store) {
  return pedido(db.transaction(store).objectStore(store).getAll());
}
function poner(db, store, valor) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(valor);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
function b64(u8) {
  let s = '';
  for (const b of u8) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function pendiente(cfg, ahora) {
  if (!cfg || !cfg.activo) return false;
  const [h, m] = cfg.hora.split(':').map(Number);
  const objetivo = new Date(ahora);
  objetivo.setHours(h, m, 0, 0);
  if (ahora < objetivo) return false;
  if (cfg.ultimoOk && new Date(cfg.ultimoOk) >= objetivo) return false;
  if (cfg.ultimoIntento && ahora - new Date(cfg.ultimoIntento) < REINTENTO_MS) return false;
  return true;
}

async function respaldoEnSegundoPlano() {
  const db = await pedido(indexedDB.open('racha'));
  if (!db.objectStoreNames.contains('cuenta')) return;
  const [c, l, cfg] = await Promise.all([leer(db, 'cuenta', 'local'), leer(db, 'cuenta', 'llave'), leer(db, 'cuenta', 'respaldo')]);
  const ahora = new Date();
  if (!c || !c.token || !l || !l.llave || !pendiente(cfg, ahora)) return;
  const datos = {};
  for (const s of STORES_SYNC) datos[s] = db.objectStoreNames.contains(s) ? await todos(db, s) : [];
  if (!Object.values(datos).some((a) => a.length)) return;
  const iso = ahora.toISOString();
  try {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, l.llave, new TextEncoder().encode(JSON.stringify(datos)));
    const datos_cifrados = `v1.${b64(iv)}.${b64(new Uint8Array(ct))}`;
    const headers = { 'content-type': 'application/json', authorization: c.token };
    const r = await fetch('/api/progressium/sync', { headers, cache: 'no-store' });
    if (!r.ok) throw new Error(r.status === 401 ? 'Tu sesión venció. Escribe tu contraseña para renovarla.' : `El servidor respondió ${r.status}.`);
    const version = Math.max((await r.json()).max_version || 0, c.version || 0) + 1;
    const p = await fetch('/api/progressium/sync', { method: 'PUT', headers, body: JSON.stringify({ dispositivo: c.dispositivo, version, datos_cifrados }) });
    if (!p.ok) throw new Error(`El servidor respondió ${p.status}.`);
    await poner(db, 'cuenta', { ...c, version, sucio: false });
    await poner(db, 'cuenta', { ...cfg, ultimoOk: iso, ultimoIntento: iso, resultado: 'ok', mensaje: '', origen: 'segundo-plano' });
  } catch (e) {
    const mensaje = 'En segundo plano: ' + (e && e.message ? e.message : 'sin conexión.');
    await poner(db, 'cuenta', { ...cfg, ultimoIntento: iso, resultado: 'error', mensaje, origen: 'segundo-plano' });
  }
}

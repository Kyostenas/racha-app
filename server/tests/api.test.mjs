// Pruebas de integración contra un servidor real (imagen Docker o binario).
// Variables: PB_URL (http://127.0.0.1:8090), PB_SU_EMAIL / PB_SU_PASSWORD (superusuario de prueba),
// PB_ORIGEN_DEV (opcional: origen extra de desarrollo permitido en CORS).
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

const URL_BASE = process.env.PB_URL || "http://127.0.0.1:8090";
const ORIGEN_DEV = process.env.PB_ORIGEN_DEV || "";
const AVISO = "2026-11-11.4";
let su = null;

// Lee siempre el cuerpo completo para que no queden sockets abiertos (si no, node --test no termina).
const fetchNativo = globalThis.fetch;
const fetch = async (...args) => {
  const r = await fetchNativo(...args);
  const cuerpo = await r.arrayBuffer();
  const sinCuerpo = [101, 204, 205, 304].includes(r.status);
  return new Response(sinCuerpo ? null : cuerpo, { status: r.status, headers: r.headers });
};

async function api(metodo, ruta, { token, body, headers } = {}) {
  const r = await fetch(URL_BASE + ruta, {
    method: metodo,
    headers: { "content-type": "application/json", ...(token ? { authorization: token } : {}), ...(headers || {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await r.json(); } catch { data = null; }
  return { status: r.status, data, headers: r.headers };
}

async function ajustarLimiteAlta(max) {
  const s = await api("GET", "/api/settings", { token: su });
  // En pruebas todas las reglas se suben (una sola IP hace cientos de llamadas); el alta se ajusta a `max`.
  const reglas = s.data.rateLimits.rules.map((r) => ({ ...r, maxRequests: r.label === "/api/progressium/alta" ? max : 100000 }));
  const p = await api("PATCH", "/api/settings", { token: su, body: { rateLimits: { ...s.data.rateLimits, rules: reglas } } });
  assert.equal(p.status, 200);
}

async function nuevaCuenta() {
  const clave = randomBytes(32).toString("base64url");
  const a = await api("POST", "/api/progressium/alta", { body: { clave, mayor_de_edad: true, consentimiento: { acepto: true, version_aviso: AVISO } } });
  assert.equal(a.status, 200, JSON.stringify(a.data));
  const l = await api("POST", "/api/collections/usuarios/auth-with-password", { body: { identity: a.data.usuario, password: clave } });
  assert.equal(l.status, 200);
  return { id: a.data.id, alias: a.data.alias, usuario: a.data.usuario, clave, token: l.data.token };
}

const TODO = { edad_rango: true, estatura_rango: true, imc_cat: true, intencion: true, dieta: true, ejercicios: true, progreso: true, cambio_peso_rango: true };
const SENSIBLE = { acepto: true, version_aviso: AVISO };
const PERFIL = { intencion: "subir", imc_cat: "normal", edad_rango: "30-34", estatura_rango: "170-179", dieta: "vegana", ejercicios: ["Squat", "Plank"] };

async function perfilCompleto(c, extra = {}, visibles = TODO) {
  const body = { ...PERFIL, ...extra, visibles, ...(visibles.cambio_peso_rango ? { consentimiento_sensible: SENSIBLE } : {}) };
  const r = await api("PUT", "/api/progressium/perfil", { token: c.token, body });
  assert.equal(r.status, 200, JSON.stringify(r.data));
}

const semana = (() => {
  const d = new Date(); const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dia = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - dia);
  const ini = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const n = Math.ceil(((t - ini) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(n).padStart(2, "0")}`;
})();

before(async () => {
  for (let i = 0; i < 60; i++) {
    try { const h = await fetch(URL_BASE + "/api/health"); if (h.ok) break; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  const r = await api("POST", "/api/collections/_superusers/auth-with-password", { body: { identity: process.env.PB_SU_EMAIL, password: process.env.PB_SU_PASSWORD } });
  assert.equal(r.status, 200, "no se pudo entrar como superusuario de prueba");
  su = r.data.token;
  await ajustarLimiteAlta(1000);
});

test("health y estado", async () => {
  assert.equal((await api("GET", "/api/health")).status, 200);
  const e = await api("GET", "/api/progressium/estado");
  assert.equal(e.data.k_min, 5);
  assert.equal(e.data.version_aviso, AVISO);
});

test("CORS cerrado: la PWA usa el mismo origen", async () => {
  if (ORIGEN_DEV) {
    const dev = await fetch(URL_BASE + "/api/health", { headers: { origin: ORIGEN_DEV } });
    assert.equal(dev.headers.get("access-control-allow-origin"), ORIGEN_DEV);
  }
  for (const o of ["https://kyostenas.github.io", "https://malo.example"]) {
    const r = await fetch(URL_BASE + "/api/health", { headers: { origin: o } });
    assert.notEqual(r.headers.get("access-control-allow-origin"), o);
    assert.notEqual(r.headers.get("access-control-allow-origin"), "*");
  }
  const malo = await fetch(URL_BASE + "/api/health", { headers: { origin: "https://malo.example" } });
  assert.notEqual(malo.headers.get("access-control-allow-origin"), "https://malo.example");
  assert.notEqual(malo.headers.get("access-control-allow-origin"), "*");
});

test("la misma instancia sirve la PWA instalable", async () => {
  const html = await (await fetch(URL_BASE + "/")).text();
  assert.match(html, /<link[^>]+rel="manifest"/);
  const manifest = await fetch(URL_BASE + "/manifest.webmanifest");
  assert.equal(manifest.status, 200);
  assert.match(manifest.headers.get("content-type") || "", /^application\/manifest\+json/);
  const m = await manifest.json();
  assert.ok(m.icons?.length && m.start_url !== undefined && m.display);
  assert.equal((await fetch(URL_BASE + "/ngsw-worker.js")).status, 200);
  assert.equal((await fetch(URL_BASE + "/ngsw.json")).status, 200);
  const aviso = await fetch(URL_BASE + "/aviso-privacidad.html");
  assert.equal(aviso.status, 200);
  const avisoHtml = await aviso.text();
  assert.match(avisoHtml, /Versión 2026-11-11\.4/);
  assert.match(avisoHtml, /Yael Benjamín Ramírez Estrada/);
  assert.match(avisoHtml, /kyostenas@gmail\.com/);
  assert.match(avisoHtml, /respaldo cifrado/);
  // Ruta de la SPA: vuelve a index.html; /api no.
  assert.match(await (await fetch(URL_BASE + "/comunidad")).text(), /rel="manifest"/);
  assert.equal((await fetch(URL_BASE + "/api/no-existe")).status, 404);
  const h = await fetch(URL_BASE + "/");
  assert.equal(h.headers.get("x-content-type-options"), "nosniff");
});

test("alta: mayor de edad, consentimiento y sin campos prohibidos", async () => {
  const clave = randomBytes(32).toString("hex");
  const consentimiento = { acepto: true, version_aviso: AVISO };
  assert.equal((await api("POST", "/api/progressium/alta", { body: { clave, mayor_de_edad: false, consentimiento } })).status, 400);
  assert.equal((await api("POST", "/api/progressium/alta", { body: { clave, mayor_de_edad: true } })).status, 400);
  for (const k of ["peso", "padecimientos", "email", "nombre"]) {
    const r = await api("POST", "/api/progressium/alta", { body: { clave, mayor_de_edad: true, consentimiento, [k]: "x" } });
    assert.equal(r.status, 400, k);
  }
});

test("la API genérica está cerrada", async () => {
  const c = await nuevaCuenta();
  for (const col of ["usuarios", "perfil_publico", "progreso_semanal", "conexiones", "consentimientos", "reportes", "eventos"]) {
    const l = await api("GET", `/api/collections/${col}/records`, { token: c.token });
    assert.ok([403, 404].includes(l.status) || (l.data && l.data.items && l.data.items.length === 0), `${col}: ${l.status}`);
    const w = await api("POST", `/api/collections/${col}/records`, { token: c.token, body: { usuario: c.id, peso: 80 } });
    assert.ok([400, 403, 404].includes(w.status), `${col} create: ${w.status}`);
    assert.notEqual(w.status, 200);
  }
  const sinToken = await api("GET", "/api/progressium/yo");
  assert.equal(sinToken.status, 401);
  const crear = await api("POST", "/api/collections/usuarios/records", { body: { username: "a".repeat(20), password: "x".repeat(40), passwordConfirm: "x".repeat(40), alias: "Hack" } });
  assert.notEqual(crear.status, 200);
});

test("perfil: apagado de inicio; campos prohibidos no se guardan", async () => {
  const c = await nuevaCuenta();
  const yo = await api("GET", "/api/progressium/yo", { token: c.token });
  assert.ok(Object.values(yo.data.perfil.visibles).every((v) => v === false));
  for (const k of ["peso", "estatura", "padecimientos", "medicamentos", "alergias"]) {
    const r = await api("PUT", "/api/progressium/perfil", { token: c.token, body: { visibles: {}, [k]: 1 } });
    assert.equal(r.status, 400, k);
  }
  // Valor con interruptor apagado → se guarda vacío.
  await api("PUT", "/api/progressium/perfil", { token: c.token, body: { intencion: "bajar", visibles: { intencion: false } } });
  const y2 = await api("GET", "/api/progressium/yo", { token: c.token });
  assert.equal(y2.data.perfil.intencion, "");
  const s = await api("PUT", "/api/progressium/semana", { token: c.token, body: { semana, pct_habitos: 50, racha: 3 } });
  assert.equal(s.status, 400);
  const raw = await api("GET", `/api/collections/perfil_publico/records?filter=usuario='${c.id}'`, { token: su });
  const fila = raw.data.items[0];
  for (const k of ["peso", "estatura", "padecimientos"]) assert.ok(!(k in fila));
  assert.equal(fila.intencion, "");
});

test("cambio de peso: solo rangos, con consentimiento expreso aparte; números exactos rechazados", async () => {
  const c = await nuevaCuenta();
  const vis = { ...TODO };
  // Sin consentimiento sensible no se puede activar.
  const sin = await api("PUT", "/api/progressium/perfil", { token: c.token, body: { ...PERFIL, visibles: vis } });
  assert.equal(sin.status, 400);
  await perfilCompleto(c);
  const cons = await api("GET", `/api/collections/consentimientos/records?filter=usuario='${c.id}'&sort=-fecha`, { token: su });
  assert.equal(cons.data.items[0].consentimiento_sensible, true);
  assert.ok(cons.data.items[0].campos_activos.includes("cambio_peso_rango"));
  for (const malo of [-1.3, 1, "-1.3", "1.2%", "-2..-1", "abc", false, [1]]) {
    const r = await api("PUT", "/api/progressium/semana", { token: c.token, body: { semana, pct_habitos: 50, racha: 3, cambio_peso_rango: malo } });
    assert.equal(r.status, 400, JSON.stringify(malo));
  }
  const viejo = await api("PUT", "/api/progressium/semana", { token: c.token, body: { semana, pct_habitos: 50, racha: 3, cambio_peso_pct: -1.5 } });
  assert.equal(viejo.status, 400);
  // La API genérica tampoco deja escribir un número (está cerrada).
  const gen = await api("PATCH", `/api/collections/progreso_semanal/records/xxxxxxxxxxxxxxx`, { token: c.token, body: { cambio_peso_rango: -1.5 } });
  assert.ok([403, 404].includes(gen.status));
  assert.equal((await api("PUT", "/api/progressium/semana", { token: c.token, body: { semana, pct_habitos: 50, racha: 3, cambio_peso_rango: "-2..-1%" } })).status, 200);
  const exp = await api("GET", "/api/progressium/exportar", { token: c.token });
  assert.equal(exp.data.progreso_semanal[0].cambio_peso_rango, "-2..-1%");
});

test("apagar progreso borra las semanas en el servidor", async () => {
  const c = await nuevaCuenta();
  await perfilCompleto(c);
  assert.equal((await api("PUT", "/api/progressium/semana", { token: c.token, body: { semana, pct_habitos: 80, racha: 4, cambio_peso_rango: "1..2%" } })).status, 200);
  let raw = await api("GET", `/api/collections/progreso_semanal/records?filter=usuario='${c.id}'`, { token: su });
  assert.equal(raw.data.items[0].cambio_peso_rango, "1..2%");
  assert.ok(!("cambio_peso_pct" in raw.data.items[0])); // la columna del número exacto ya no existe
  // Apagar solo el cambio de peso lo borra del servidor y conserva el resto.
  await api("PUT", "/api/progressium/perfil", { token: c.token, body: { ...PERFIL, visibles: { ...TODO, cambio_peso_rango: false } } });
  raw = await api("GET", `/api/collections/progreso_semanal/records?filter=usuario='${c.id}'`, { token: su });
  assert.equal(raw.data.items[0].cambio_peso_rango, "");
  assert.equal(raw.data.items[0].pct_habitos, 80);
  await api("PUT", "/api/progressium/perfil", { token: c.token, body: { ...PERFIL, visibles: { ...TODO, progreso: false, cambio_peso_rango: false } } });
  raw = await api("GET", `/api/collections/progreso_semanal/records?filter=usuario='${c.id}'`, { token: su });
  assert.equal(raw.data.items.length, 0);
});

test("match, comparación, conexiones, retos, feed, reportes, exportar y borrar", async () => {
  // Aísla el grupo de esta prueba: un ejercicio único y la dieta apagada (la afinidad sale solo del ejercicio).
  const ejer = "Ejer_" + randomBytes(3).toString("hex");
  const extra = { ejercicios: [ejer], intencion: "mantener" };
  const vis = { ...TODO, dieta: false };
  const gente = [];
  for (let i = 0; i < 4; i++) { const c = await nuevaCuenta(); await perfilCompleto(c, extra, vis); gente.push(c); }
  // 4 personas: no alcanza k=5
  const m4 = await api("GET", "/api/progressium/match", { token: gente[0].token });
  assert.equal(m4.status, 200);
  assert.equal(m4.data.suficiente, false);
  assert.equal(m4.data.candidatos.length, 0);
  const c4 = await api("GET", "/api/progressium/comparar", { token: gente[0].token });
  assert.equal(c4.data.suficiente, false);
  const quinto = await nuevaCuenta(); await perfilCompleto(quinto, extra, vis); gente.push(quinto);
  for (const [i, g] of gente.entries()) {
    assert.equal((await api("PUT", "/api/progressium/semana", { token: g.token, body: { semana, pct_habitos: 20 * i, racha: 6 + i, cambio_peso_rango: ["-1..0%", "-2..-1%", "0..1%", "<-5%", ">=5%"][i] } })).status, 200);
  }
  const m5 = await api("GET", "/api/progressium/match", { token: gente[0].token });
  assert.equal(m5.data.suficiente, true, JSON.stringify(m5.data));
  assert.ok(m5.data.n >= 5);
  const permitidas = ["usuario", "alias", "puntaje", "edad_rango", "imc_cat", "intencion", "dieta", "ejercicios_en_comun", "conexion"];
  for (const c of m5.data.candidatos) for (const k of Object.keys(c)) assert.ok(permitidas.includes(k), k);
  const cmp = await api("GET", "/api/progressium/comparar", { token: gente[4].token });
  assert.equal(cmp.data.suficiente, true);
  assert.deepEqual(Object.keys(cmp.data).sort(), ["cambio_peso", "habitos", "n", "racha", "suficiente"]);
  assert.ok(cmp.data.habitos > 50);

  // Conexión: solo quien recibe acepta; con conexión aceptada se ve el progreso.
  const [a, b, c, d, e] = gente;
  const sol = await api("POST", "/api/progressium/conexiones", { token: a.token, body: { para: b.id } });
  assert.equal(sol.data.estado, "solicitada");
  assert.equal((await api("PATCH", `/api/progressium/conexiones/${sol.data.id}`, { token: a.token, body: { estado: "aceptada" } })).status, 403);
  assert.equal((await api("GET", `/api/progressium/conexiones/${sol.data.id}/progreso`, { token: a.token })).status, 403);
  assert.equal((await api("PATCH", `/api/progressium/conexiones/${sol.data.id}`, { token: b.token, body: { estado: "aceptada" } })).data.estado, "aceptada");
  const prog = await api("GET", `/api/progressium/conexiones/${sol.data.id}/progreso`, { token: a.token });
  assert.equal(prog.data.compartido, true);
  assert.equal(prog.data.semanas[0].pct_habitos, 20);
  assert.equal((await api("GET", `/api/progressium/conexiones/${sol.data.id}/progreso`, { token: c.token })).status, 404);
  const fuera = await nuevaCuenta();
  assert.equal((await api("POST", "/api/progressium/conexiones", { token: fuera.token, body: { para: a.id } })).status, 403);
  assert.equal((await api("POST", "/api/progressium/conexiones", { token: a.token, body: { para: c.id, nota: "hola" } })).status, 400);

  // Retos y feed: completar un reto crea un evento visible para la conexión, que puede reaccionar.
  const retos = await api("GET", "/api/progressium/retos", { token: b.token });
  const reto = retos.data.retos.find((r) => r.clave === "fuerza-3");
  assert.ok(reto);
  await api("POST", "/api/progressium/retos/fuerza-3/unirse", { token: b.token });
  assert.equal((await api("PUT", "/api/progressium/retos/fuerza-3/avance", { token: b.token, body: { avance: 9 } })).status, 400);
  await api("PUT", "/api/progressium/retos/fuerza-3/avance", { token: b.token, body: { avance: 3 } });
  const feed = await api("GET", "/api/progressium/feed", { token: a.token });
  const ev = feed.data.eventos.find((x) => x.usuario === b.id && x.tipo === "reto_completado");
  assert.ok(ev, JSON.stringify(feed.data));
  assert.equal((await api("POST", "/api/progressium/reacciones", { token: a.token, body: { evento: ev.id, tipo: "aplauso" } })).status, 200);
  assert.equal((await api("POST", "/api/progressium/reacciones", { token: a.token, body: { evento: ev.id, tipo: "texto libre" } })).status, 400);
  assert.equal((await api("POST", "/api/progressium/reacciones", { token: fuera.token, body: { evento: ev.id, tipo: "fuego" } })).status, 404);
  const feed2 = await api("GET", "/api/progressium/feed", { token: b.token });
  assert.equal(feed2.data.eventos.find((x) => x.id === ev.id).reacciones.aplauso, 1);

  // Bloqueo: desaparece del match y la conexión se borra.
  assert.equal((await api("POST", "/api/progressium/bloquear", { token: a.token, body: { usuario: b.id } })).status, 200);
  const mb = await api("GET", "/api/progressium/match", { token: b.token });
  assert.ok(!(mb.data.candidatos || []).some((x) => x.usuario === a.id));
  const lb = await api("GET", "/api/progressium/conexiones", { token: b.token });
  assert.equal(lb.data.conexiones.length, 0);

  // Reportes: 3 personas distintas ocultan el perfil.
  for (const g of [a, b, c]) assert.equal((await api("POST", "/api/progressium/reportar", { token: g.token, body: { usuario: e.id, motivo: "spam" } })).status, 200);
  assert.equal((await api("POST", "/api/progressium/reportar", { token: d.token, body: { usuario: e.id, motivo: "lo que sea" } })).status, 400);
  const yoE = await api("GET", "/api/progressium/yo", { token: e.token });
  assert.equal(yoE.data.oculto, true);
  const md = await api("GET", "/api/progressium/match", { token: d.token });
  assert.ok(!(md.data.candidatos || []).some((x) => x.usuario === e.id));

  // Exportar no trae secretos; borrar cuenta borra todo en cascada.
  const ex = await api("GET", "/api/progressium/exportar", { token: a.token });
  const txt = JSON.stringify(ex.data);
  assert.ok(!txt.includes(a.clave));
  assert.ok(!/password|tokenKey|email/i.test(txt));
  assert.ok(ex.data.consentimientos.length >= 2);
  assert.equal((await api("DELETE", "/api/progressium/cuenta", { token: a.token })).status, 200);
  assert.equal((await api("POST", "/api/collections/usuarios/auth-with-password", { body: { identity: a.usuario, password: a.clave } })).status, 400);
  for (const col of ["perfil_publico", "progreso_semanal", "consentimientos"]) {
    const raw = await api("GET", `/api/collections/${col}/records?filter=usuario='${a.id}'`, { token: su });
    assert.equal(raw.data.items.length, 0, col);
  }
  const conx = await api("GET", `/api/collections/conexiones/records?filter=de='${a.id}'||para='${a.id}'`, { token: su });
  assert.equal(conx.data.items.length, 0);
});

test("límite de tasa en el alta", async () => {
  await ajustarLimiteAlta(2);
  try {
    const codigos = [];
    for (let i = 0; i < 4; i++) codigos.push((await api("POST", "/api/progressium/alta", { body: {} })).status);
    assert.ok(codigos.includes(429), codigos.join(","));
  } finally {
    await new Promise((r) => setTimeout(r, 1100));
    await ajustarLimiteAlta(1000);
  }
});

test("los alias no se repiten", async () => {
  const alias = new Set();
  for (let i = 0; i < 25; i++) alias.add((await nuevaCuenta()).alias);
  assert.equal(alias.size, 25);
});

test("cuenta: alta, sync cifrado, rechazo de claro, historial de 3 y borrado", async () => {
  const usuario = "u" + randomBytes(6).toString("hex");
  const contrasena = "secreto12";
  const alta = await api("POST", "/api/progressium/cuenta/alta", {
    body: { usuario, contrasena, mayor_de_edad: true, acepto_terminos: true, version_aviso: AVISO },
  });
  assert.equal(alta.status, 200, alta.error);
  assert.ok(alta.data.salt && alta.data.salt.length === 32);
  const auth = await fetch(URL_BASE + "/api/collections/usuarios/auth-with-password", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ identity: usuario, password: contrasena }),
  });
  const tok = (await auth.json()).token;
  assert.ok(tok);
  const H = { authorization: tok };
  const claro = await api("PUT", "/api/progressium/sync", { headers: H, body: { dispositivo: "11111111-1111-1111-1111-111111111111", version: 1, datos_cifrados: JSON.stringify({ perfil: { peso: 70 } }) } });
  assert.equal(claro.status, 400);
  const blob = "v1.YWJjZGVmZ2hpams.YWJjZGVmZ2hpag";
  for (const version of [1, 2, 3, 4]) {
    const r = await api("PUT", "/api/progressium/sync", { headers: H, body: { dispositivo: "11111111-1111-1111-1111-111111111111", version, datos_cifrados: blob } });
    assert.equal(r.status, 200, r.error);
  }
  const st = await api("GET", "/api/progressium/sync", { headers: H });
  assert.equal(st.status, 200);
  assert.equal(st.data.max_version, 4);
  assert.equal(st.data.historial.length, 3);
  assert.equal(st.data.ultimo.datos_cifrados, blob);
  const conflicto = await api("PUT", "/api/progressium/sync", { headers: H, body: { dispositivo: "11111111-1111-1111-1111-111111111111", version: 4, datos_cifrados: blob } });
  assert.equal(conflicto.status, 409);
  const drop = await api("DELETE", "/api/progressium/cuenta", { headers: H });
  assert.equal(drop.status, 200);
  assert.equal((await api("GET", "/api/progressium/sync", { headers: H })).status, 401);
});

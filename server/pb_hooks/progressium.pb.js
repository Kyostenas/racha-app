/// <reference path="../pb_data/types.d.ts" />
// Rutas de la comunidad de Progressium. Cada handler corre aislado en PocketBase (goja),
// por eso cada uno hace require() de sus módulos.

routerAdd("GET", "/api/progressium/estado", (e) => {
  const R = require(`${__hooks}/lib/reglas.js`);
  return e.json(200, { servicio: "progressium", version: $os.getenv("PROGRESSIUM_VERSION") || "dev", version_aviso: R.VERSION_AVISO, k_min: R.K_MIN });
});


routerAdd("POST", "/api/progressium/cuenta/alta", (e) => {
  const R = require(`${__hooks}/lib/reglas.js`);
  const body = e.requestInfo().body;
  const v = R.validarCuentaAlta(body);
  if (!v.ok) throw new BadRequestError(v.error, { campos: v.campos });
  const col = $app.findCollectionByNameOrId("usuarios");
  let tomado = false;
  try { $app.findFirstRecordByFilter("usuarios", "username = {:u}", { u: body.usuario }); tomado = true; } catch (_) {}
  if (tomado) throw new BadRequestError("Ese alias ya está en uso.", { campos: ["usuario"] });
  const u = new Record(col);
  u.set("username", body.usuario);
  u.set("alias", body.usuario);
  u.set("oculto", false);
  u.set("ultimo_uso", new DateTime());
  u.set("sync_salt", $security.randomStringWithAlphabet(32, "0123456789abcdef"));
  u.setPassword(body.contrasena);
  if (body.correo) u.set("email", body.correo);
  $app.save(u);
  return e.json(200, { id: u.id, usuario: u.getString("username"), alias: u.getString("alias"), salt: u.getString("sync_salt") });
});

routerAdd("GET", "/api/progressium/sync", (e) => {
  const S = require(`${__hooks}/lib/servicio.js`);
  const yo = S.tocar(e.auth);
  const salt = yo.getString("sync_salt");
  if (!salt) throw new BadRequestError("Esta cuenta no tiene respaldo cifrado.");
  const filas = $app.findRecordsByFilter("respaldo_sync", "usuario = {:u}", "-version", 3, 0, { u: yo.id });
  const historial = filas.map((r) => ({ dispositivo: r.getString("dispositivo"), version: r.getInt("version"), actualizado: r.get("actualizado") }));
  const ultimo = filas[0] ? { dispositivo: filas[0].getString("dispositivo"), version: filas[0].getInt("version"), actualizado: filas[0].get("actualizado"), datos_cifrados: filas[0].getString("datos_cifrados") } : null;
  return e.json(200, { salt, max_version: ultimo ? ultimo.version : 0, ultimo, historial });
}, $apis.requireAuth("usuarios"));

routerAdd("PUT", "/api/progressium/sync", (e) => {
  const R = require(`${__hooks}/lib/reglas.js`);
  const S = require(`${__hooks}/lib/servicio.js`);
  const yo = S.tocar(e.auth);
  if (!yo.getString("sync_salt")) throw new BadRequestError("Esta cuenta no tiene respaldo cifrado.");
  const v = R.validarSync(e.requestInfo().body);
  if (!v.ok) throw new BadRequestError(v.error, { campos: v.campos });
  const body = e.requestInfo().body;
  const prev = $app.findRecordsByFilter("respaldo_sync", "usuario = {:u}", "-version", 1, 0, { u: yo.id });
  const max = prev[0] ? prev[0].getInt("version") : 0;
  if (body.version <= max) return e.json(409, { message: "Ya hay una versión igual o más nueva.", max_version: max });
  const rec = new Record($app.findCollectionByNameOrId("respaldo_sync"));
  rec.set("usuario", yo.id);
  rec.set("dispositivo", body.dispositivo);
  rec.set("version", body.version);
  rec.set("datos_cifrados", body.datos_cifrados);
  $app.save(rec);
  $app.findRecordsByFilter("respaldo_sync", "usuario = {:u}", "-version", 0, 0, { u: yo.id }).forEach((r, i) => {
    if (i >= 3) $app.delete(r);
  });
  return e.json(200, { version: body.version });
}, $apis.requireAuth("usuarios"));

routerAdd("POST", "/api/progressium/alta", (e) => {
  const R = require(`${__hooks}/lib/reglas.js`);
  const body = e.requestInfo().body;
  const v = R.validarAlta(body);
  if (!v.ok) throw new BadRequestError(v.error, { campos: v.campos });
  const col = $app.findCollectionByNameOrId("usuarios");
  const u = new Record(col);
  u.set("username", $security.randomStringWithAlphabet(24, "abcdefghijklmnopqrstuvwxyz0123456789"));
  // Alias único: se prueba al azar y, si se agotan, se le agrega un número.
  let alias = "";
  for (let i = 0; i < 30 && !alias; i++) {
    const a = R.aliasAleatorio(Math.random);
    try { $app.findFirstRecordByFilter("usuarios", "alias = {:a}", { a: a }); } catch (_) { alias = a; }
  }
  if (!alias) alias = R.aliasAleatorio(Math.random) + " " + $security.randomStringWithAlphabet(3, "0123456789");
  u.set("alias", alias);
  u.set("oculto", false);
  u.set("ultimo_uso", new DateTime());
  u.setPassword(body.clave);
  $app.runInTransaction((tx) => {
    tx.save(u);
    const c = new Record(tx.findCollectionByNameOrId("consentimientos"));
    c.set("usuario", u.id); c.set("version_aviso", R.VERSION_AVISO); c.set("campos_activos", []);
    tx.save(c);
    const p = new Record(tx.findCollectionByNameOrId("perfil_publico"));
    const vis = {}; R.INTERRUPTORES.forEach((k) => (vis[k] = false));
    p.set("usuario", u.id); p.set("visibles", vis); p.set("ejercicios", []);
    tx.save(p);
  });
  const nuevo = $app.findRecordById("usuarios", u.id);
  return e.json(200, { usuario: nuevo.getString("username"), alias: nuevo.getString("alias"), id: nuevo.id });
});

routerAdd("GET", "/api/progressium/yo", (e) => {
  const S = require(`${__hooks}/lib/servicio.js`);
  const yo = S.tocar(e.auth);
  return e.json(200, S.resumenPropio(yo));
}, $apis.requireAuth("usuarios"));

routerAdd("PUT", "/api/progressium/perfil", (e) => {
  const R = require(`${__hooks}/lib/reglas.js`);
  const S = require(`${__hooks}/lib/servicio.js`);
  const yo = S.tocar(e.auth);
  const actual = $app.findFirstRecordByFilter("perfil_publico", "usuario = {:u}", { u: yo.id });
  const v = R.validarPerfil(e.requestInfo().body, S.json(actual, "visibles") || {});
  if (!v.ok) throw new BadRequestError(v.error, { campos: v.campos });
  $app.runInTransaction((tx) => {
    const p = tx.findFirstRecordByFilter("perfil_publico", "usuario = {:u}", { u: yo.id });
    const antes = S.json(p, "visibles") || {};
    Object.keys(v.valor).forEach((k) => p.set(k, v.valor[k]));
    p.set("visibles", v.visibles);
    tx.save(p);
    // Apagar un interruptor borra el dato en el servidor en ese momento.
    if (!v.visibles.progreso) {
      tx.findRecordsByFilter("progreso_semanal", "usuario = {:u}", "", 0, 0, { u: yo.id }).forEach((r) => tx.delete(r));
    } else if (!v.visibles.cambio_peso_rango) {
      tx.findRecordsByFilter("progreso_semanal", "usuario = {:u} && cambio_peso_rango != ''", "", 0, 0, { u: yo.id }).forEach((r) => { r.set("cambio_peso_rango", ""); tx.save(r); });
    }
    const activos = R.INTERRUPTORES.filter((k) => v.visibles[k]);
    const antesActivos = R.INTERRUPTORES.filter((k) => antes[k] === true);
    if (activos.join() !== antesActivos.join() || v.sensible) {
      const c = new Record(tx.findCollectionByNameOrId("consentimientos"));
      c.set("usuario", yo.id); c.set("version_aviso", R.VERSION_AVISO); c.set("campos_activos", activos);
      c.set("consentimiento_sensible", v.sensible === true);
      tx.save(c);
    }
  });
  return e.json(200, S.resumenPropio(yo));
}, $apis.requireAuth("usuarios"));

routerAdd("PUT", "/api/progressium/semana", (e) => {
  const R = require(`${__hooks}/lib/reglas.js`);
  const S = require(`${__hooks}/lib/servicio.js`);
  const yo = S.tocar(e.auth);
  const perfil = $app.findFirstRecordByFilter("perfil_publico", "usuario = {:u}", { u: yo.id });
  const v = R.validarSemana(e.requestInfo().body, S.json(perfil, "visibles"));
  if (!v.ok) throw new BadRequestError(v.error, { campos: v.campos });
  S.guardarSemana(yo, v.valor);
  return e.json(200, { ok: true });
}, $apis.requireAuth("usuarios"));

routerAdd("GET", "/api/progressium/match", (e) => {
  const R = require(`${__hooks}/lib/reglas.js`);
  const S = require(`${__hooks}/lib/servicio.js`);
  const yo = S.tocar(e.auth);
  const g = S.grupo(yo);
  if (!g.yo.intencion) return e.json(200, { suficiente: false, n_minimo: R.K_MIN, motivo: "Activa al menos tu intención para buscar personas parecidas." });
  const r = R.match(g.yo, g.otros, R.K_MIN);
  const pend = S.estadosCon(yo.id);
  r.candidatos.forEach((c) => (c.conexion = pend[c.usuario] || null));
  return e.json(200, r);
}, $apis.requireAuth("usuarios"));

routerAdd("GET", "/api/progressium/comparar", (e) => {
  const R = require(`${__hooks}/lib/reglas.js`);
  const S = require(`${__hooks}/lib/servicio.js`);
  const yo = S.tocar(e.auth);
  const g = S.grupo(yo);
  if (!g.yo.intencion) return e.json(200, { suficiente: false, n_minimo: R.K_MIN });
  const ids = g.otros.filter((o) => R.parecido(g.yo, o)).map((o) => o.usuario);
  const sem = S.semanasRecientes([yo.id].concat(ids));
  const mia = sem[yo.id] || null;
  const otras = ids.map((id) => sem[id]).filter((s) => !!s);
  return e.json(200, R.comparar(g.yo, mia, otras, R.K_MIN));
}, $apis.requireAuth("usuarios"));

routerAdd("GET", "/api/progressium/conexiones", (e) => {
  const S = require(`${__hooks}/lib/servicio.js`);
  const yo = S.tocar(e.auth);
  return e.json(200, { conexiones: S.listarConexiones(yo.id) });
}, $apis.requireAuth("usuarios"));

routerAdd("POST", "/api/progressium/conexiones", (e) => {
  const R = require(`${__hooks}/lib/reglas.js`);
  const S = require(`${__hooks}/lib/servicio.js`);
  const yo = S.tocar(e.auth);
  const b = e.requestInfo().body || {};
  const ex = R.extras(b, ["para"]);
  if (ex.length) throw new BadRequestError("Campos no permitidos.", { campos: ex });
  return e.json(200, S.solicitar(yo, String(b.para || "")));
}, $apis.requireAuth("usuarios"));

routerAdd("PATCH", "/api/progressium/conexiones/{id}", (e) => {
  const R = require(`${__hooks}/lib/reglas.js`);
  const S = require(`${__hooks}/lib/servicio.js`);
  const yo = S.tocar(e.auth);
  const b = e.requestInfo().body || {};
  const ex = R.extras(b, ["estado"]);
  if (ex.length) throw new BadRequestError("Campos no permitidos.", { campos: ex });
  return e.json(200, S.responder(yo, e.request.pathValue("id"), String(b.estado || "")));
}, $apis.requireAuth("usuarios"));

routerAdd("DELETE", "/api/progressium/conexiones/{id}", (e) => {
  const S = require(`${__hooks}/lib/servicio.js`);
  const yo = S.tocar(e.auth);
  S.quitar(yo, e.request.pathValue("id"));
  return e.json(200, { ok: true });
}, $apis.requireAuth("usuarios"));

routerAdd("GET", "/api/progressium/conexiones/{id}/progreso", (e) => {
  const S = require(`${__hooks}/lib/servicio.js`);
  const yo = S.tocar(e.auth);
  return e.json(200, S.progresoDe(yo, e.request.pathValue("id")));
}, $apis.requireAuth("usuarios"));

routerAdd("POST", "/api/progressium/bloquear", (e) => {
  const R = require(`${__hooks}/lib/reglas.js`);
  const S = require(`${__hooks}/lib/servicio.js`);
  const yo = S.tocar(e.auth);
  const b = e.requestInfo().body || {};
  const ex = R.extras(b, ["usuario"]);
  if (ex.length) throw new BadRequestError("Campos no permitidos.", { campos: ex });
  S.bloquear(yo, String(b.usuario || ""));
  return e.json(200, { ok: true });
}, $apis.requireAuth("usuarios"));

routerAdd("POST", "/api/progressium/reportar", (e) => {
  const R = require(`${__hooks}/lib/reglas.js`);
  const S = require(`${__hooks}/lib/servicio.js`);
  const yo = S.tocar(e.auth);
  const b = e.requestInfo().body || {};
  const ex = R.extras(b, ["usuario", "motivo"]);
  if (ex.length) throw new BadRequestError("Campos no permitidos.", { campos: ex });
  if (R.MOTIVOS.indexOf(b.motivo) < 0) throw new BadRequestError("Motivo inválido.", { campos: ["motivo"] });
  S.reportar(yo, String(b.usuario || ""), b.motivo);
  return e.json(200, { ok: true });
}, $apis.requireAuth("usuarios"));

routerAdd("GET", "/api/progressium/retos", (e) => {
  const S = require(`${__hooks}/lib/servicio.js`);
  const yo = S.tocar(e.auth);
  return e.json(200, { retos: S.retos(yo) });
}, $apis.requireAuth("usuarios"));

routerAdd("POST", "/api/progressium/retos/{clave}/unirse", (e) => {
  const S = require(`${__hooks}/lib/servicio.js`);
  const yo = S.tocar(e.auth);
  S.unirse(yo, e.request.pathValue("clave"));
  return e.json(200, { retos: S.retos(yo) });
}, $apis.requireAuth("usuarios"));

routerAdd("PUT", "/api/progressium/retos/{clave}/avance", (e) => {
  const R = require(`${__hooks}/lib/reglas.js`);
  const S = require(`${__hooks}/lib/servicio.js`);
  const yo = S.tocar(e.auth);
  const b = e.requestInfo().body || {};
  const ex = R.extras(b, ["avance"]);
  if (ex.length) throw new BadRequestError("Campos no permitidos.", { campos: ex });
  if (!Number.isInteger(b.avance) || b.avance < 0 || b.avance > 7) throw new BadRequestError("Avance inválido (0 a 7).", { campos: ["avance"] });
  S.avance(yo, e.request.pathValue("clave"), b.avance);
  return e.json(200, { retos: S.retos(yo) });
}, $apis.requireAuth("usuarios"));

routerAdd("DELETE", "/api/progressium/retos/{clave}", (e) => {
  const S = require(`${__hooks}/lib/servicio.js`);
  const yo = S.tocar(e.auth);
  S.salir(yo, e.request.pathValue("clave"));
  return e.json(200, { retos: S.retos(yo) });
}, $apis.requireAuth("usuarios"));

routerAdd("GET", "/api/progressium/feed", (e) => {
  const S = require(`${__hooks}/lib/servicio.js`);
  const yo = S.tocar(e.auth);
  return e.json(200, { eventos: S.feed(yo) });
}, $apis.requireAuth("usuarios"));

routerAdd("POST", "/api/progressium/reacciones", (e) => {
  const R = require(`${__hooks}/lib/reglas.js`);
  const S = require(`${__hooks}/lib/servicio.js`);
  const yo = S.tocar(e.auth);
  const b = e.requestInfo().body || {};
  const ex = R.extras(b, ["evento", "tipo"]);
  if (ex.length) throw new BadRequestError("Campos no permitidos.", { campos: ex });
  if (R.REACCIONES.indexOf(b.tipo) < 0) throw new BadRequestError("Reacción inválida.", { campos: ["tipo"] });
  S.reaccionar(yo, String(b.evento || ""), b.tipo);
  return e.json(200, { ok: true });
}, $apis.requireAuth("usuarios"));

routerAdd("GET", "/api/progressium/exportar", (e) => {
  const S = require(`${__hooks}/lib/servicio.js`);
  const yo = S.tocar(e.auth);
  return e.json(200, S.exportar(yo));
}, $apis.requireAuth("usuarios"));

routerAdd("DELETE", "/api/progressium/cuenta", (e) => {
  const u = $app.findRecordById("usuarios", e.auth.id);
  $app.delete(u); // las relaciones tienen borrado en cascada
  return e.json(200, { borrada: true });
}, $apis.requireAuth("usuarios"));

// Cuentas sin uso por 180 días se borran solas.
cronAdd("progressium_inactivos", "17 3 * * *", () => {
  const R = require(`${__hooks}/lib/reglas.js`);
  const limite = new Date(Date.now() - R.DIAS_INACTIVIDAD * 86400000).toISOString().replace("T", " ");
  $app.findRecordsByFilter("usuarios", "ultimo_uso < {:l}", "", 500, 0, { l: limite }).forEach((u) => $app.delete(u));
});

// La API genérica de usuarios no deja leer ni editar nada (reglas null); además se bloquea
// cambiar alias/oculto por cualquier vía que no sea superusuario.
onRecordUpdateRequest((e) => {
  if (!e.hasSuperuserAuth()) throw new ForbiddenError("Solo lectura.");
  e.next();
}, "usuarios");

// Encabezados de seguridad para la PWA y la API (mismo origen).
// Además, el panel /_/ y la autenticación de superusuarios no se sirven por Tailscale Funnel
// (Internet): solo dentro del tailnet (puerto 8443) o en 127.0.0.1. serve.json ya los desvía en el
// 443; esto es la segunda barrera, con el encabezado que Tailscale añade a las peticiones de Funnel.
routerUse((e) => {
  const ruta = e.request.url.path;
  const esPanel = ruta === "/_" || ruta.indexOf("/_/") === 0 || ruta.indexOf("/api/collections/_superusers") === 0 || ruta.indexOf("/api/collections/pbc_3142635823") === 0;
  if (esPanel && e.request.header.get("Tailscale-Funnel-Request")) {
    throw new NotFoundError("No encontrado.");
  }
  const h = e.response.header();
  h.set("X-Content-Type-Options", "nosniff");
  h.set("Referrer-Policy", "no-referrer");
  h.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), interest-cohort=()");
  h.set("X-Frame-Options", "DENY");
  // Go no conoce .webmanifest (lo serviría como text/plain); el tipo correcto es application/manifest+json.
  if (ruta.endsWith(".webmanifest")) h.set("Content-Type", "application/manifest+json");
  return e.next();
});

// /api/* desconocido responde 404 en JSON (sin esto el fallback de la SPA devolvería index.html).
["GET", "POST", "PUT", "PATCH", "DELETE"].forEach((m) => {
  routerAdd(m, "/api/{resto...}", (e) => {
    throw new NotFoundError("No encontrado.");
  });
});

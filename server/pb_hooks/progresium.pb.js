/// <reference path="../pb_data/types.d.ts" />
// Rutas de la comunidad de Progresium. Cada handler corre aislado en PocketBase (goja),
// por eso cada uno hace require() de sus módulos.

routerAdd("GET", "/api/progresium/estado", (e) => {
  const R = require(`${__hooks}/lib/reglas.js`);
  return e.json(200, { servicio: "progresium", version: $os.getenv("PROGRESIUM_VERSION") || "dev", version_aviso: R.VERSION_AVISO, k_min: R.K_MIN });
});

routerAdd("POST", "/api/progresium/alta", (e) => {
  const R = require(`${__hooks}/lib/reglas.js`);
  const body = e.requestInfo().body;
  const v = R.validarAlta(body);
  if (!v.ok) throw new BadRequestError(v.error, { campos: v.campos });
  const col = $app.findCollectionByNameOrId("usuarios");
  const u = new Record(col);
  u.set("username", $security.randomStringWithAlphabet(24, "abcdefghijklmnopqrstuvwxyz0123456789"));
  u.set("alias", R.aliasAleatorio(Math.random));
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

routerAdd("GET", "/api/progresium/yo", (e) => {
  const S = require(`${__hooks}/lib/servicio.js`);
  const yo = S.tocar(e.auth);
  return e.json(200, S.resumenPropio(yo));
}, $apis.requireAuth("usuarios"));

routerAdd("PUT", "/api/progresium/perfil", (e) => {
  const R = require(`${__hooks}/lib/reglas.js`);
  const S = require(`${__hooks}/lib/servicio.js`);
  const yo = S.tocar(e.auth);
  const v = R.validarPerfil(e.requestInfo().body);
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
    } else if (!v.visibles.cambio_peso) {
      tx.findRecordsByFilter("progreso_semanal", "usuario = {:u}", "", 0, 0, { u: yo.id }).forEach((r) => { r.set("cambio_peso_pct", null); tx.save(r); });
    }
    const activos = R.INTERRUPTORES.filter((k) => v.visibles[k]);
    const antesActivos = R.INTERRUPTORES.filter((k) => antes[k] === true);
    if (activos.join() !== antesActivos.join()) {
      const c = new Record(tx.findCollectionByNameOrId("consentimientos"));
      c.set("usuario", yo.id); c.set("version_aviso", R.VERSION_AVISO); c.set("campos_activos", activos);
      tx.save(c);
    }
  });
  return e.json(200, S.resumenPropio(yo));
}, $apis.requireAuth("usuarios"));

routerAdd("PUT", "/api/progresium/semana", (e) => {
  const R = require(`${__hooks}/lib/reglas.js`);
  const S = require(`${__hooks}/lib/servicio.js`);
  const yo = S.tocar(e.auth);
  const perfil = $app.findFirstRecordByFilter("perfil_publico", "usuario = {:u}", { u: yo.id });
  const v = R.validarSemana(e.requestInfo().body, S.json(perfil, "visibles"));
  if (!v.ok) throw new BadRequestError(v.error, { campos: v.campos });
  S.guardarSemana(yo, v.valor);
  return e.json(200, { ok: true });
}, $apis.requireAuth("usuarios"));

routerAdd("GET", "/api/progresium/match", (e) => {
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

routerAdd("GET", "/api/progresium/comparar", (e) => {
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

routerAdd("GET", "/api/progresium/conexiones", (e) => {
  const S = require(`${__hooks}/lib/servicio.js`);
  const yo = S.tocar(e.auth);
  return e.json(200, { conexiones: S.listarConexiones(yo.id) });
}, $apis.requireAuth("usuarios"));

routerAdd("POST", "/api/progresium/conexiones", (e) => {
  const R = require(`${__hooks}/lib/reglas.js`);
  const S = require(`${__hooks}/lib/servicio.js`);
  const yo = S.tocar(e.auth);
  const b = e.requestInfo().body || {};
  const ex = R.extras(b, ["para"]);
  if (ex.length) throw new BadRequestError("Campos no permitidos.", { campos: ex });
  return e.json(200, S.solicitar(yo, String(b.para || "")));
}, $apis.requireAuth("usuarios"));

routerAdd("PATCH", "/api/progresium/conexiones/{id}", (e) => {
  const R = require(`${__hooks}/lib/reglas.js`);
  const S = require(`${__hooks}/lib/servicio.js`);
  const yo = S.tocar(e.auth);
  const b = e.requestInfo().body || {};
  const ex = R.extras(b, ["estado"]);
  if (ex.length) throw new BadRequestError("Campos no permitidos.", { campos: ex });
  return e.json(200, S.responder(yo, e.request.pathValue("id"), String(b.estado || "")));
}, $apis.requireAuth("usuarios"));

routerAdd("DELETE", "/api/progresium/conexiones/{id}", (e) => {
  const S = require(`${__hooks}/lib/servicio.js`);
  const yo = S.tocar(e.auth);
  S.quitar(yo, e.request.pathValue("id"));
  return e.json(200, { ok: true });
}, $apis.requireAuth("usuarios"));

routerAdd("GET", "/api/progresium/conexiones/{id}/progreso", (e) => {
  const S = require(`${__hooks}/lib/servicio.js`);
  const yo = S.tocar(e.auth);
  return e.json(200, S.progresoDe(yo, e.request.pathValue("id")));
}, $apis.requireAuth("usuarios"));

routerAdd("POST", "/api/progresium/bloquear", (e) => {
  const R = require(`${__hooks}/lib/reglas.js`);
  const S = require(`${__hooks}/lib/servicio.js`);
  const yo = S.tocar(e.auth);
  const b = e.requestInfo().body || {};
  const ex = R.extras(b, ["usuario"]);
  if (ex.length) throw new BadRequestError("Campos no permitidos.", { campos: ex });
  S.bloquear(yo, String(b.usuario || ""));
  return e.json(200, { ok: true });
}, $apis.requireAuth("usuarios"));

routerAdd("POST", "/api/progresium/reportar", (e) => {
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

routerAdd("GET", "/api/progresium/retos", (e) => {
  const S = require(`${__hooks}/lib/servicio.js`);
  const yo = S.tocar(e.auth);
  return e.json(200, { retos: S.retos(yo) });
}, $apis.requireAuth("usuarios"));

routerAdd("POST", "/api/progresium/retos/{clave}/unirse", (e) => {
  const S = require(`${__hooks}/lib/servicio.js`);
  const yo = S.tocar(e.auth);
  S.unirse(yo, e.request.pathValue("clave"));
  return e.json(200, { retos: S.retos(yo) });
}, $apis.requireAuth("usuarios"));

routerAdd("PUT", "/api/progresium/retos/{clave}/avance", (e) => {
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

routerAdd("DELETE", "/api/progresium/retos/{clave}", (e) => {
  const S = require(`${__hooks}/lib/servicio.js`);
  const yo = S.tocar(e.auth);
  S.salir(yo, e.request.pathValue("clave"));
  return e.json(200, { retos: S.retos(yo) });
}, $apis.requireAuth("usuarios"));

routerAdd("GET", "/api/progresium/feed", (e) => {
  const S = require(`${__hooks}/lib/servicio.js`);
  const yo = S.tocar(e.auth);
  return e.json(200, { eventos: S.feed(yo) });
}, $apis.requireAuth("usuarios"));

routerAdd("POST", "/api/progresium/reacciones", (e) => {
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

routerAdd("GET", "/api/progresium/exportar", (e) => {
  const S = require(`${__hooks}/lib/servicio.js`);
  const yo = S.tocar(e.auth);
  return e.json(200, S.exportar(yo));
}, $apis.requireAuth("usuarios"));

routerAdd("DELETE", "/api/progresium/cuenta", (e) => {
  const u = $app.findRecordById("usuarios", e.auth.id);
  $app.delete(u); // las relaciones tienen borrado en cascada
  return e.json(200, { borrada: true });
}, $apis.requireAuth("usuarios"));

// Cuentas sin uso por 180 días se borran solas.
cronAdd("progresium_inactivos", "17 3 * * *", () => {
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

// Acceso a datos de la comunidad (usa los globales de PocketBase: $app, Record, errores).
"use strict";
const R = require(`${__hooks}/lib/reglas.js`);

function json(rec, campo) {
  const s = rec.getString(campo);
  if (!s) return null;
  try { return JSON.parse(s); } catch (_) { return null; }
}

function buscar(col, filtro, params, orden, limite) {
  return $app.findRecordsByFilter(col, filtro, orden || "", limite || 0, 0, params || {});
}

function primero(col, filtro, params) {
  try { return $app.findFirstRecordByFilter(col, filtro, params || {}); } catch (_) { return null; }
}

function tocar(auth) {
  const u = $app.findRecordById("usuarios", auth.id);
  const ultimo = u.getDateTime("ultimo_uso");
  const hoy = new Date().toISOString().slice(0, 10);
  if (!ultimo || String(ultimo.string()).slice(0, 10) !== hoy) {
    u.set("ultimo_uso", new DateTime());
    $app.saveNoValidate(u);
  }
  return u;
}

function perfilPlano(p, u) {
  const vis = json(p, "visibles") || {};
  return {
    usuario: p.getString("usuario"),
    alias: u ? u.getString("alias") : "",
    edad_rango: vis.edad_rango ? p.getString("edad_rango") : "",
    estatura_rango: vis.estatura_rango ? p.getString("estatura_rango") : "",
    imc_cat: vis.imc_cat ? p.getString("imc_cat") : "",
    intencion: vis.intencion ? p.getString("intencion") : "",
    dieta: vis.dieta ? p.getString("dieta") : "",
    ejercicios: vis.ejercicios ? (json(p, "ejercicios") || []) : [],
    visibles: vis,
  };
}

function resumenPropio(u) {
  const p = primero("perfil_publico", "usuario = {:u}", { u: u.id });
  const plano = p ? perfilPlano(p, u) : null;
  return { id: u.id, alias: u.getString("alias"), oculto: u.getBool("oculto"), perfil: plano, version_aviso: R.VERSION_AVISO };
}

// Ids con los que hay un bloqueo en cualquier dirección.
function bloqueados(id) {
  const fuera = {};
  buscar("conexiones", "estado = 'bloqueada' && (de = {:u} || para = {:u})", { u: id }).forEach((c) => {
    fuera[c.getString("de") === id ? c.getString("para") : c.getString("de")] = true;
  });
  return fuera;
}

function grupo(u) {
  const p = $app.findFirstRecordByFilter("perfil_publico", "usuario = {:u}", { u: u.id });
  const yo = perfilPlano(p, u);
  const fuera = bloqueados(u.id);
  const otros = [];
  if (!yo.intencion) return { yo, otros };
  buscar("perfil_publico", "usuario != {:u} && intencion = {:i} && usuario.oculto = false", { u: u.id, i: yo.intencion }).forEach((r) => {
    const id = r.getString("usuario");
    if (fuera[id]) return;
    const o = perfilPlano(r, $app.findRecordById("usuarios", id));
    if (!o.intencion) return; // su interruptor de intención está apagado
    otros.push(o);
  });
  return { yo, otros };
}

// Última semana con dato (de las 2 más recientes) por usuario con progreso visible.
function semanasRecientes(ids) {
  const out = {};
  if (!ids.length) return out;
  const ahora = new Date();
  const semanas = [R.semanaISO(ahora), R.semanaISO(new Date(ahora.getTime() - 7 * 86400000))];
  ids.forEach((id) => {
    const p = primero("perfil_publico", "usuario = {:u}", { u: id });
    const vis = p ? json(p, "visibles") || {} : {};
    if (!vis.progreso) return;
    const r = buscar("progreso_semanal", "usuario = {:u} && (semana = {:a} || semana = {:b})", { u: id, a: semanas[0], b: semanas[1] }, "-semana", 1)[0];
    if (!r) return;
    const cp = r.get("cambio_peso_pct");
    out[id] = {
      pct_habitos: r.getInt("pct_habitos"),
      racha: r.getInt("racha"),
      cambio_peso_pct: vis.cambio_peso && cp !== null && cp !== undefined && r.getString("cambio_peso_pct") !== "" ? r.getFloat("cambio_peso_pct") : null,
    };
  });
  return out;
}

const HITOS = [7, 30, 100, 365];

function guardarSemana(u, v) {
  let r = primero("progreso_semanal", "usuario = {:u} && semana = {:s}", { u: u.id, s: v.semana });
  const previa = buscar("progreso_semanal", "usuario = {:u}", { u: u.id }, "-racha", 1)[0];
  const rachaAntes = previa ? previa.getInt("racha") : 0;
  if (!r) { r = new Record($app.findCollectionByNameOrId("progreso_semanal")); r.set("usuario", u.id); r.set("semana", v.semana); }
  r.set("pct_habitos", v.pct_habitos); r.set("racha", v.racha); r.set("cambio_peso_pct", v.cambio_peso_pct);
  $app.save(r);
  const hito = HITOS.filter((h) => rachaAntes < h && v.racha >= h).pop();
  if (hito) evento(u.id, "racha_hito", null, hito);
}

function evento(usuario, tipo, reto, valor) {
  const ev = new Record($app.findCollectionByNameOrId("eventos"));
  ev.set("usuario", usuario); ev.set("tipo", tipo); if (reto) ev.set("reto", reto); ev.set("valor", valor || 0);
  $app.save(ev);
}

function estadosCon(id) {
  const m = {};
  buscar("conexiones", "de = {:u} || para = {:u}", { u: id }).forEach((c) => {
    const otro = c.getString("de") === id ? c.getString("para") : c.getString("de");
    m[otro] = { id: c.id, estado: c.getString("estado"), mia: c.getString("de") === id };
  });
  return m;
}

function listarConexiones(id) {
  return buscar("conexiones", "(de = {:u} || para = {:u}) && estado != 'rechazada'", { u: id }, "-actualizado").map((c) => {
    const mia = c.getString("de") === id;
    const otro = mia ? c.getString("para") : c.getString("de");
    const u = $app.findRecordById("usuarios", otro);
    const estado = c.getString("estado");
    // Un bloqueo hecho por la otra persona se ve como si la conexión no existiera.
    if (estado === "bloqueada" && !mia) return null;
    return { id: c.id, usuario: otro, alias: u.getString("alias"), estado, enviada_por_mi: mia };
  }).filter((x) => !!x);
}

function solicitar(yo, para) {
  if (!para || para === yo.id) throw new BadRequestError("Destino inválido.");
  const fuera = bloqueados(yo.id);
  let destino = null;
  try { destino = $app.findRecordById("usuarios", para); } catch (_) {}
  if (!destino || destino.getBool("oculto") || fuera[para]) throw new NotFoundError("No encontrado.");
  // Solo se puede pedir conexión a alguien de tu grupo parecido (y con k suficiente).
  const g = grupo(yo);
  const m = R.match(g.yo, g.otros, R.K_MIN);
  if (!m.suficiente || !m.candidatos.some((c) => c.usuario === para)) throw new ForbiddenError("Solo puedes conectar con personas de tu grupo parecido.");
  const existe = primero("conexiones", "(de = {:a} && para = {:b}) || (de = {:b} && para = {:a})", { a: yo.id, b: para });
  if (existe) {
    if (existe.getString("estado") === "rechazada" && existe.getString("de") === yo.id) throw new BadRequestError("Esa persona no aceptó la solicitud.");
    if (existe.getString("de") === para && existe.getString("estado") === "solicitada") { existe.set("estado", "aceptada"); $app.save(existe); }
    return { id: existe.id, estado: existe.getString("estado") };
  }
  const c = new Record($app.findCollectionByNameOrId("conexiones"));
  c.set("de", yo.id); c.set("para", para); c.set("estado", "solicitada");
  $app.save(c);
  return { id: c.id, estado: "solicitada" };
}

function propiaConexion(yo, id) {
  let c = null;
  try { c = $app.findRecordById("conexiones", id); } catch (_) {}
  if (!c || (c.getString("de") !== yo.id && c.getString("para") !== yo.id)) throw new NotFoundError("No encontrado.");
  return c;
}

function responder(yo, id, estado) {
  const c = propiaConexion(yo, id);
  if (["aceptada", "rechazada", "bloqueada"].indexOf(estado) < 0) throw new BadRequestError("Estado inválido.", { campos: ["estado"] });
  const actual = c.getString("estado");
  if (estado === "bloqueada") {
    const otro = c.getString("de") === yo.id ? c.getString("para") : c.getString("de");
    bloquear(yo, otro);
    return { id: c.id, estado: "bloqueada" };
  }
  if (c.getString("para") !== yo.id || actual !== "solicitada") throw new ForbiddenError("Solo quien recibe una solicitud pendiente puede aceptarla o rechazarla.");
  c.set("estado", estado); $app.save(c);
  return { id: c.id, estado };
}

function quitar(yo, id) {
  const c = propiaConexion(yo, id);
  if (c.getString("estado") === "bloqueada" && c.getString("de") !== yo.id) throw new NotFoundError("No encontrado.");
  $app.delete(c);
}

function bloquear(yo, otro) {
  if (!otro || otro === yo.id) throw new BadRequestError("Destino inválido.");
  try { $app.findRecordById("usuarios", otro); } catch (_) { throw new NotFoundError("No encontrado."); }
  buscar("conexiones", "(de = {:a} && para = {:b}) || (de = {:b} && para = {:a})", { a: yo.id, b: otro }).forEach((c) => $app.delete(c));
  const c = new Record($app.findCollectionByNameOrId("conexiones"));
  c.set("de", yo.id); c.set("para", otro); c.set("estado", "bloqueada");
  $app.save(c);
}

function progresoDe(yo, id) {
  const c = propiaConexion(yo, id);
  if (c.getString("estado") !== "aceptada") throw new ForbiddenError("Solo con una conexión aceptada.");
  const otro = c.getString("de") === yo.id ? c.getString("para") : c.getString("de");
  const p = primero("perfil_publico", "usuario = {:u}", { u: otro });
  const vis = p ? json(p, "visibles") || {} : {};
  const u = $app.findRecordById("usuarios", otro);
  if (!vis.progreso) return { alias: u.getString("alias"), compartido: false, semanas: [] };
  const semanas = buscar("progreso_semanal", "usuario = {:u}", { u: otro }, "-semana", 8).map((r) => ({
    semana: r.getString("semana"), pct_habitos: r.getInt("pct_habitos"), racha: r.getInt("racha"),
    cambio_peso_pct: vis.cambio_peso && r.getString("cambio_peso_pct") !== "" ? r.getFloat("cambio_peso_pct") : null,
  }));
  return { alias: u.getString("alias"), compartido: true, semanas };
}

function reportar(yo, contra, motivo) {
  if (!contra || contra === yo.id) throw new BadRequestError("Destino inválido.");
  let u = null;
  try { u = $app.findRecordById("usuarios", contra); } catch (_) {}
  if (!u) throw new NotFoundError("No encontrado.");
  if (!primero("reportes", "de = {:a} && contra = {:b}", { a: yo.id, b: contra })) {
    const r = new Record($app.findCollectionByNameOrId("reportes"));
    r.set("de", yo.id); r.set("contra", contra); r.set("motivo", motivo);
    $app.save(r);
  }
  const n = buscar("reportes", "contra = {:b}", { b: contra }).length;
  if (n >= R.REPORTES_PARA_OCULTAR && !u.getBool("oculto")) { u.set("oculto", true); $app.saveNoValidate(u); }
}

function reto(clave) {
  const r = primero("retos", "clave = {:c} && activo = true", { c: clave });
  if (!r) throw new NotFoundError("Reto no encontrado.");
  return r;
}

function retos(yo) {
  const semana = R.semanaISO(new Date());
  return buscar("retos", "activo = true", {}, "clave").map((r) => {
    const p = primero("participaciones", "reto = {:r} && usuario = {:u} && semana = {:s}", { r: r.id, u: yo.id, s: semana });
    const n = buscar("participaciones", "reto = {:r} && semana = {:s}", { r: r.id, s: semana }).length;
    return {
      clave: r.getString("clave"), titulo: r.getString("titulo"), descripcion: r.getString("descripcion"), meta: r.getInt("meta"),
      semana, unido: !!p, avance: p ? p.getInt("avance") : 0, completado: p ? p.getBool("completado") : false,
      participantes: n >= R.K_MIN ? n : null,
    };
  });
}

function unirse(yo, clave) {
  const r = reto(clave);
  const semana = R.semanaISO(new Date());
  if (primero("participaciones", "reto = {:r} && usuario = {:u} && semana = {:s}", { r: r.id, u: yo.id, s: semana })) return;
  const p = new Record($app.findCollectionByNameOrId("participaciones"));
  p.set("reto", r.id); p.set("usuario", yo.id); p.set("semana", semana); p.set("avance", 0); p.set("completado", false);
  $app.save(p);
}

function avance(yo, clave, valor) {
  const r = reto(clave);
  const semana = R.semanaISO(new Date());
  const p = primero("participaciones", "reto = {:r} && usuario = {:u} && semana = {:s}", { r: r.id, u: yo.id, s: semana });
  if (!p) throw new BadRequestError("Primero únete al reto.");
  p.set("avance", valor);
  const listo = valor >= r.getInt("meta");
  const antes = p.getBool("completado");
  p.set("completado", listo);
  $app.save(p);
  if (listo && !antes) evento(yo.id, "reto_completado", r.id, r.getInt("meta"));
}

function salir(yo, clave) {
  const r = reto(clave);
  buscar("participaciones", "reto = {:r} && usuario = {:u}", { r: r.id, u: yo.id }).forEach((p) => $app.delete(p));
}

// Quiénes aparecen en mi feed: yo, conexiones aceptadas y quienes están en mis retos esta semana.
function circulo(yo) {
  const ids = {}; ids[yo.id] = true;
  buscar("conexiones", "estado = 'aceptada' && (de = {:u} || para = {:u})", { u: yo.id }).forEach((c) => {
    ids[c.getString("de") === yo.id ? c.getString("para") : c.getString("de")] = true;
  });
  const semana = R.semanaISO(new Date());
  buscar("participaciones", "usuario = {:u} && semana = {:s}", { u: yo.id, s: semana }).forEach((p) => {
    buscar("participaciones", "reto = {:r} && semana = {:s}", { r: p.getString("reto"), s: semana }).forEach((q) => (ids[q.getString("usuario")] = true));
  });
  const fuera = bloqueados(yo.id);
  Object.keys(fuera).forEach((k) => delete ids[k]);
  return ids;
}

function feed(yo) {
  const ids = circulo(yo);
  const out = [];
  buscar("eventos", "usuario.oculto = false", {}, "-creado", 300).forEach((ev) => {
    if (out.length >= 50 || !ids[ev.getString("usuario")]) return;
    const u = $app.findRecordById("usuarios", ev.getString("usuario"));
    let titulo = null;
    if (ev.getString("reto")) { try { titulo = $app.findRecordById("retos", ev.getString("reto")).getString("titulo"); } catch (_) {} }
    const cuenta = { aplauso: 0, fuerza: 0, fuego: 0 };
    let mia = null;
    buscar("reacciones", "evento = {:e}", { e: ev.id }).forEach((r) => {
      cuenta[r.getString("tipo")]++;
      if (r.getString("de") === yo.id) mia = r.getString("tipo");
    });
    out.push({ id: ev.id, usuario: u.id, alias: u.getString("alias"), propio: u.id === yo.id, tipo: ev.getString("tipo"), reto: titulo, valor: ev.getInt("valor"), creado: ev.getString("creado"), reacciones: cuenta, mi_reaccion: mia });
  });
  return out;
}

function reaccionar(yo, eventoId, tipo) {
  let ev = null;
  try { ev = $app.findRecordById("eventos", eventoId); } catch (_) {}
  if (!ev || !circulo(yo)[ev.getString("usuario")]) throw new NotFoundError("No encontrado.");
  let r = primero("reacciones", "de = {:u} && evento = {:e}", { u: yo.id, e: ev.id });
  if (!r) { r = new Record($app.findCollectionByNameOrId("reacciones")); r.set("de", yo.id); r.set("evento", ev.id); }
  r.set("tipo", tipo);
  $app.save(r);
}

function exportar(yo) {
  const plano = (r, campos) => { const o = {}; campos.forEach((c) => (o[c] = r.get(c))); return o; };
  const parse = (r, c) => json(r, c);
  return {
    exportado: new Date().toISOString(),
    aviso: R.VERSION_AVISO,
    cuenta: { id: yo.id, alias: yo.getString("alias"), oculto: yo.getBool("oculto"), creado: yo.getString("creado"), ultimo_uso: yo.getString("ultimo_uso") },
    perfil_publico: buscar("perfil_publico", "usuario = {:u}", { u: yo.id }).map((r) => Object.assign(plano(r, ["edad_rango", "estatura_rango", "imc_cat", "intencion", "dieta", "actualizado"]), { ejercicios: parse(r, "ejercicios"), visibles: parse(r, "visibles") })),
    progreso_semanal: buscar("progreso_semanal", "usuario = {:u}", { u: yo.id }, "semana").map((r) => plano(r, ["semana", "pct_habitos", "racha", "cambio_peso_pct"])),
    conexiones: listarConexiones(yo.id),
    consentimientos: buscar("consentimientos", "usuario = {:u}", { u: yo.id }, "fecha").map((r) => ({ version_aviso: r.getString("version_aviso"), fecha: r.getString("fecha"), campos_activos: parse(r, "campos_activos") })),
    participaciones: buscar("participaciones", "usuario = {:u}", { u: yo.id }).map((r) => plano(r, ["semana", "avance", "completado"])),
    eventos: buscar("eventos", "usuario = {:u}", { u: yo.id }).map((r) => plano(r, ["tipo", "valor", "creado"])),
    reacciones_dadas: buscar("reacciones", "de = {:u}", { u: yo.id }).map((r) => plano(r, ["tipo", "creado"])),
    reportes_hechos: buscar("reportes", "de = {:u}", { u: yo.id }).map((r) => plano(r, ["motivo", "creado"])),
  };
}

module.exports = { json, tocar, resumenPropio, grupo, semanasRecientes, guardarSemana, estadosCon, listarConexiones, solicitar, responder, quitar, bloquear, progresoDe, reportar, retos, unirse, avance, salir, feed, reaccionar, exportar };

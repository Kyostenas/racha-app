/// <reference path="../pb_data/types.d.ts" />
// Esquema inicial de la comunidad de Progressium.
// Todas las colecciones quedan cerradas a la API genérica (reglas null = solo superusuario).
// La PWA solo habla con las rutas de pb_hooks (/api/progressium/*), que validan con listas permitidas.
migrate((app) => {
  const usuarios = new Collection({
    type: "auth",
    name: "usuarios",
    listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
    authRule: "",
    passwordAuth: { enabled: true, identityFields: ["username"] },
    fields: [
      { name: "username", type: "text", required: true, min: 16, max: 40, pattern: "^[a-z0-9]+$" },
      { name: "alias", type: "text", required: true, max: 60 },
      { name: "oculto", type: "bool" },
      { name: "ultimo_uso", type: "date" },
      { name: "creado", type: "autodate", onCreate: true },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_usuarios_username ON usuarios (username)",
    ],
  });
  app.save(usuarios);
  // Sin correo: la cuenta es anónima (usuario aleatorio + clave guardada en el teléfono).
  const email = usuarios.fields.getByName("email");
  email.required = false;
  app.save(usuarios);

  const rel = (name, col, extra) => Object.assign(
    { name, type: "relation", required: true, collectionId: col.id, cascadeDelete: true, maxSelect: 1 }, extra || {});

  app.save(new Collection({
    type: "base", name: "perfil_publico",
    fields: [
      rel("usuario", usuarios),
      { name: "edad_rango", type: "text", max: 10 },
      { name: "estatura_rango", type: "text", max: 10 },
      { name: "imc_cat", type: "text", max: 12 },
      { name: "intencion", type: "text", max: 12 },
      { name: "dieta", type: "text", max: 16 },
      { name: "ejercicios", type: "json", maxSize: 1000 },
      { name: "visibles", type: "json", maxSize: 1000 },
      { name: "actualizado", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_perfil_usuario ON perfil_publico (usuario)"],
  }));

  app.save(new Collection({
    type: "base", name: "progreso_semanal",
    fields: [
      rel("usuario", usuarios),
      { name: "semana", type: "text", required: true, pattern: "^\\d{4}-W\\d{2}$" },
      { name: "pct_habitos", type: "number", min: 0, max: 100, onlyInt: true },
      { name: "racha", type: "number", min: 0, max: 100000, onlyInt: true },
      { name: "cambio_peso_pct", type: "number", min: -30, max: 30 },
      { name: "actualizado", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_semana_usuario ON progreso_semanal (usuario, semana)"],
  }));

  app.save(new Collection({
    type: "base", name: "conexiones",
    fields: [
      rel("de", usuarios), rel("para", usuarios),
      { name: "estado", type: "select", required: true, maxSelect: 1, values: ["solicitada", "aceptada", "rechazada", "bloqueada"] },
      { name: "creado", type: "autodate", onCreate: true },
      { name: "actualizado", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_conexion_par ON conexiones (de, para)"],
  }));

  app.save(new Collection({
    type: "base", name: "consentimientos",
    fields: [
      rel("usuario", usuarios),
      { name: "version_aviso", type: "text", required: true, max: 20 },
      { name: "campos_activos", type: "json", maxSize: 2000 },
      { name: "fecha", type: "autodate", onCreate: true },
    ],
  }));

  const retos = new Collection({
    type: "base", name: "retos",
    fields: [
      { name: "clave", type: "text", required: true, max: 40 },
      { name: "titulo", type: "text", required: true, max: 80 },
      { name: "descripcion", type: "text", max: 300 },
      { name: "meta", type: "number", required: true, min: 1, max: 7, onlyInt: true },
      { name: "activo", type: "bool" },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_retos_clave ON retos (clave)"],
  });
  app.save(retos);

  app.save(new Collection({
    type: "base", name: "participaciones",
    fields: [
      rel("reto", retos), rel("usuario", usuarios),
      { name: "semana", type: "text", required: true, pattern: "^\\d{4}-W\\d{2}$" },
      { name: "avance", type: "number", min: 0, max: 7, onlyInt: true },
      { name: "completado", type: "bool" },
      { name: "actualizado", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_part_unica ON participaciones (reto, usuario, semana)"],
  }));

  const eventos = new Collection({
    type: "base", name: "eventos",
    fields: [
      rel("usuario", usuarios),
      { name: "tipo", type: "select", required: true, maxSelect: 1, values: ["reto_completado", "racha_hito"] },
      { name: "reto", type: "relation", collectionId: retos.id, cascadeDelete: true, maxSelect: 1 },
      { name: "valor", type: "number", onlyInt: true },
      { name: "creado", type: "autodate", onCreate: true },
    ],
  });
  app.save(eventos);

  app.save(new Collection({
    type: "base", name: "reacciones",
    fields: [
      rel("de", usuarios), rel("evento", eventos),
      { name: "tipo", type: "select", required: true, maxSelect: 1, values: ["aplauso", "fuerza", "fuego"] },
      { name: "creado", type: "autodate", onCreate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_reaccion_unica ON reacciones (de, evento)"],
  }));

  app.save(new Collection({
    type: "base", name: "reportes",
    fields: [
      rel("de", usuarios), rel("contra", usuarios),
      { name: "motivo", type: "select", required: true, maxSelect: 1, values: ["alias_ofensivo", "spam", "acoso", "suplantacion", "otro"] },
      { name: "creado", type: "autodate", onCreate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_reporte_unico ON reportes (de, contra)"],
  }));

  // Retos predefinidos (solo el equipo los cambia desde el panel).
  const semilla = [
    ["caminata-5", "5 días con caminata", "Camina al menos 20 minutos en 5 días de la semana.", 5],
    ["agua-7", "7 días con agua", "Marca tu hábito de agua los 7 días.", 7],
    ["fuerza-3", "3 días de fuerza", "Haz 3 sesiones de ejercicios de fuerza del catálogo.", 3],
    ["dormir-5", "5 noches de buen sueño", "Duerme a tu hora en 5 noches de la semana.", 5],
  ];
  for (const [clave, titulo, descripcion, meta] of semilla) {
    const r = new Record(retos);
    r.set("clave", clave); r.set("titulo", titulo); r.set("descripcion", descripcion);
    r.set("meta", meta); r.set("activo", true);
    app.save(r);
  }

  // Límites de tasa (se aplican por IP; detrás de Funnel/Cloudflare se usa X-Forwarded-For).
  const s = app.settings();
  s.meta.appName = "Progressium";
  s.rateLimits.enabled = true;
  s.rateLimits.rules = [
    { label: "/api/progressium/alta", maxRequests: 5, duration: 3600, audience: "" },
    { label: "/api/progressium/conexiones", maxRequests: 30, duration: 60, audience: "" },
    { label: "/api/progressium/reportar", maxRequests: 10, duration: 3600, audience: "" },
    { label: "/api/collections/usuarios/auth-with-password", maxRequests: 10, duration: 60, audience: "" },
    { label: "/api/", maxRequests: 120, duration: 60, audience: "" },
  ];
  // Detrás de Funnel/Cloudflare el cliente real viene en X-Forwarded-For (el puerto solo escucha en 127.0.0.1).
  s.trustedProxy.headers = ["X-Forwarded-For"];
  s.trustedProxy.useLeftmostIP = false;
  // Respaldo interno diario además del respaldo del host (scripts/respaldo.sh).
  s.backups.cron = "30 3 * * *";
  s.backups.cronMaxKeep = 7;
  s.logs.maxDays = 7;
  s.logs.logIP = false;
  app.save(s);
}, (app) => {
  for (const n of ["reportes", "reacciones", "eventos", "participaciones", "retos", "consentimientos", "conexiones", "progreso_semanal", "perfil_publico", "usuarios"]) {
    try { app.delete(app.findCollectionByNameOrId(n)); } catch (_) {}
  }
});

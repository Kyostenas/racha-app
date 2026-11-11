// Reglas puras de la comunidad (sin dependencias de PocketBase): validación con listas
// permitidas, match y percentiles. Se usan en pb_hooks y en las pruebas de Node.
"use strict";

const VERSION_AVISO = "2026-11-11.6";
const K_MIN = 5; // k-anonimato: tamaño mínimo del grupo (incluye a quien consulta)
const MAX_LISTA = 10;

const EDADES = ["18-24", "25-29", "30-34", "35-39", "40-44", "45-49", "50-54", "55-59", "60+"];
const ESTATURAS = ["<140", "140-149", "150-159", "160-169", "170-179", "180-189", "190-199", "200+"];
const IMC = ["bajo", "normal", "sobrepeso", "obesidad"];
const INTENCIONES = ["bajar", "mantener", "subir"];
const DIETAS = ["omnivora", "vegetariana", "vegana", "pescetariana", "sin_gluten", "otra"];
const CAMPOS_PERFIL = ["edad_rango", "estatura_rango", "imc_cat", "intencion", "dieta", "ejercicios"];
const INTERRUPTORES = CAMPOS_PERFIL.concat(["progreso", "cambio_peso_rango"]);
// Cambio de peso (dato de salud, sensible en la LFPDPPP): solo en rangos de 1 %, calculados en el cliente.
// El servidor nunca recibe ni guarda kg ni el porcentaje exacto. Orden de menor a mayor.
const RANGOS_PESO = ["<-5%", "-5..-4%", "-4..-3%", "-3..-2%", "-2..-1%", "-1..0%", "0..1%", "1..2%", "2..3%", "3..4%", "4..5%", ">=5%"];
const EJERCICIO_RE = /^[A-Za-z0-9_\-]{1,60}$/;
const SEMANA_RE = /^\d{4}-W\d{2}$/;
const REACCIONES = ["aplauso", "fuerza", "fuego"];
const MOTIVOS = ["alias_ofensivo", "spam", "acoso", "suplantacion", "otro"];
const REPORTES_PARA_OCULTAR = 3;
const DIAS_INACTIVIDAD = 180;

const ALIAS_A = ["Ajolote", "Colibrí", "Jaguar", "Quetzal", "Cenzontle", "Venado", "Tlacuache", "Coyote", "Halcón", "Tortuga", "Mariposa", "Cacomixtle", "Garza", "Lince", "Nopal", "Ahuehuete", "Maguey", "Ocelote"];
const ALIAS_B = ["Constante", "Valiente", "Tranquilo", "Animado", "Firme", "Sereno", "Curioso", "Alegre", "Paciente", "Veloz", "Tenaz", "Luminoso"];

// Cualquier clave fuera de la lista permitida se rechaza (nunca se guarda en silencio).
function extras(obj, permitidas) {
  return Object.keys(obj || {}).filter((k) => permitidas.indexOf(k) < 0);
}

function err(msg, campos) { return { ok: false, error: msg, campos: campos || [] }; }

function esObjeto(x) { return x !== null && typeof x === "object" && !Array.isArray(x); }

function validarAlta(body) {
  if (!esObjeto(body)) return err("Cuerpo inválido.");
  const ex = extras(body, ["clave", "mayor_de_edad", "consentimiento"]);
  if (ex.length) return err("Campos no permitidos.", ex);
  if (typeof body.clave !== "string" || body.clave.length < 32 || body.clave.length > 128) return err("La clave debe tener entre 32 y 128 caracteres.");
  if (body.mayor_de_edad !== true) return err("La comunidad es solo para mayores de 18 años.");
  const c = body.consentimiento;
  if (!esObjeto(c) || c.acepto !== true || c.version_aviso !== VERSION_AVISO) return err("Falta el consentimiento expreso con la versión vigente del aviso.");
  const exc = extras(c, ["acepto", "version_aviso"]);
  if (exc.length) return err("Campos no permitidos.", exc);
  return { ok: true };
}

// antes: interruptores vigentes en el servidor. Activar el cambio de peso exige consentimiento expreso aparte.
function validarPerfil(body, antes) {
  if (!esObjeto(body)) return err("Cuerpo inválido.");
  const ex = extras(body, CAMPOS_PERFIL.concat(["visibles", "consentimiento_sensible"]));
  if (ex.length) return err("Campos no permitidos.", ex);
  const v = body.visibles;
  if (!esObjeto(v)) return err("Faltan los interruptores (visibles).");
  const exv = extras(v, INTERRUPTORES);
  if (exv.length) return err("Interruptores desconocidos.", exv);
  for (const k of Object.keys(v)) if (typeof v[k] !== "boolean") return err("Interruptor inválido.", [k]);
  const listas = { edad_rango: EDADES, estatura_rango: ESTATURAS, imc_cat: IMC, intencion: INTENCIONES, dieta: DIETAS };
  const limpio = {};
  const visibles = {};
  for (const k of INTERRUPTORES) visibles[k] = v[k] === true; // todo apagado por defecto
  let sensible = false;
  if (body.consentimiento_sensible !== undefined) {
    const c = body.consentimiento_sensible;
    if (!esObjeto(c) || extras(c, ["acepto", "version_aviso"]).length || c.acepto !== true || c.version_aviso !== VERSION_AVISO)
      return err("Consentimiento para el cambio de peso inválido.", ["consentimiento_sensible"]);
    sensible = true;
  }
  if (visibles.cambio_peso_rango && !(antes && antes.cambio_peso_rango === true) && !sensible)
    return err("Compartir el cambio de peso (dato de salud) requiere tu consentimiento expreso.", ["consentimiento_sensible"]);
  for (const k of Object.keys(listas)) {
    const val = body[k];
    if (val === undefined || val === null || !visibles[k]) { limpio[k] = ""; continue; }
    if (listas[k].indexOf(val) < 0) return err("Valor fuera de rango.", [k]);
    limpio[k] = val;
  }
  if (visibles.ejercicios && body.ejercicios !== undefined && body.ejercicios !== null) {
    const e = body.ejercicios;
    if (!Array.isArray(e) || e.length > 5 || e.some((x) => typeof x !== "string" || !EJERCICIO_RE.test(x))) return err("Ejercicios inválidos (máximo 5 ids del catálogo).", ["ejercicios"]);
    limpio.ejercicios = Array.from(new Set(e));
  } else {
    limpio.ejercicios = [];
  }
  return { ok: true, valor: limpio, visibles, sensible: sensible && visibles.cambio_peso_rango };
}

function validarSemana(body, visibles) {
  if (!esObjeto(body)) return err("Cuerpo inválido.");
  // cambio_peso_pct (número exacto) ya no existe: cae en "Campos no permitidos".
  const ex = extras(body, ["semana", "pct_habitos", "racha", "cambio_peso_rango"]);
  if (ex.length) return err("Campos no permitidos.", ex);
  if (!visibles || !visibles.progreso) return err("El progreso está apagado; actívalo para compartirlo.");
  if (typeof body.semana !== "string" || !SEMANA_RE.test(body.semana)) return err("Semana inválida (AAAA-Wss).", ["semana"]);
  if (!Number.isInteger(body.pct_habitos) || body.pct_habitos < 0 || body.pct_habitos > 100) return err("pct_habitos inválido.", ["pct_habitos"]);
  if (!Number.isInteger(body.racha) || body.racha < 0 || body.racha > 100000) return err("racha inválida.", ["racha"]);
  let rango = "";
  if (body.cambio_peso_rango !== undefined && body.cambio_peso_rango !== null) {
    if (!visibles.cambio_peso_rango) return err("El cambio de peso está apagado.", ["cambio_peso_rango"]);
    if (typeof body.cambio_peso_rango !== "string" || RANGOS_PESO.indexOf(body.cambio_peso_rango) < 0)
      return err("cambio_peso_rango debe ser uno de los rangos permitidos (nunca un número).", ["cambio_peso_rango"]);
    rango = body.cambio_peso_rango;
  }
  return { ok: true, valor: { semana: body.semana, pct_habitos: body.pct_habitos, racha: body.racha, cambio_peso_rango: rango } };
}

function cerca(lista, a, b) {
  const i = lista.indexOf(a), j = lista.indexOf(b);
  return i >= 0 && j >= 0 && Math.abs(i - j) <= 1;
}

// ¿b pertenece al grupo parecido de a? Requiere misma intención; IMC y edad iguales o vecinos
// (solo si a los comparte); y al menos un ejercicio o la dieta en común si a comparte alguno.
function parecido(a, b) {
  if (!a.intencion || a.intencion !== b.intencion) return false;
  if (a.imc_cat && !cerca(IMC, a.imc_cat, b.imc_cat)) return false;
  if (a.edad_rango && !cerca(EDADES, a.edad_rango, b.edad_rango)) return false;
  const ea = a.ejercicios || [], eb = b.ejercicios || [];
  const exigeAfinidad = ea.length > 0 || !!a.dieta;
  if (exigeAfinidad) {
    const comun = ea.some((x) => eb.indexOf(x) >= 0);
    const dieta = !!a.dieta && a.dieta === b.dieta;
    if (!comun && !dieta) return false;
  }
  return true;
}

function puntaje(a, b) {
  let p = 0;
  if (a.intencion && a.intencion === b.intencion) p += 3;
  if (a.imc_cat && a.imc_cat === b.imc_cat) p += 2; else if (a.imc_cat && cerca(IMC, a.imc_cat, b.imc_cat)) p += 1;
  if (a.edad_rango && cerca(EDADES, a.edad_rango, b.edad_rango)) p += 1;
  if (a.dieta && a.dieta === b.dieta) p += 1;
  const eb = b.ejercicios || [];
  p += Math.min(3, (a.ejercicios || []).filter((x) => eb.indexOf(x) >= 0).length);
  return p;
}

// Devuelve candidatos solo si el grupo parecido (incluida la persona) tiene k o más.
function match(yo, otros, k) {
  k = k || K_MIN;
  const grupo = otros.filter((o) => parecido(yo, o));
  const n = grupo.length + 1;
  if (n < k) return { suficiente: false, n_minimo: k, candidatos: [] };
  const candidatos = grupo
    .map((o) => ({ o, p: puntaje(yo, o) }))
    .sort((x, y) => y.p - x.p || (y.o.actividad || 0) - (x.o.actividad || 0))
    .slice(0, MAX_LISTA)
    .map((x) => ({
      usuario: x.o.usuario, alias: x.o.alias, puntaje: x.p,
      edad_rango: x.o.edad_rango || null, imc_cat: x.o.imc_cat || null, intencion: x.o.intencion || null,
      dieta: x.o.dieta || null, ejercicios_en_comun: (yo.ejercicios || []).filter((e) => (x.o.ejercicios || []).indexOf(e) >= 0),
    }));
  return { suficiente: true, n, candidatos };
}

// Percentil = % del grupo por debajo de mi valor (los empates cuentan la mitad). Nunca devuelve valores ajenos.
function percentil(mio, valores) {
  if (!valores.length) return null;
  let menos = 0, iguales = 0;
  for (const v of valores) { if (v < mio) menos++; else if (v === mio) iguales++; }
  return Math.round(((menos + iguales / 2) / valores.length) * 100);
}

function comparar(yo, miSemana, grupoSemanas, k) {
  k = k || K_MIN;
  const n = grupoSemanas.length + 1;
  if (!miSemana || n < k) return { suficiente: false, n_minimo: k };
  const r = { suficiente: true, n };
  r.habitos = percentil(miSemana.pct_habitos, grupoSemanas.map((s) => s.pct_habitos).concat([miSemana.pct_habitos]));
  r.racha = percentil(miSemana.racha, grupoSemanas.map((s) => s.racha).concat([miSemana.racha]));
  // Sin comparación de peso con intención de bajar e IMC bajo (riesgo de conductas alimentarias de riesgo).
  const pesoSeguro = !(yo.intencion === "bajar" && yo.imc_cat === "bajo");
  const idx = (x) => RANGOS_PESO.indexOf(x);
  const conPeso = grupoSemanas.filter((s) => idx(s.cambio_peso_rango) >= 0);
  if (pesoSeguro && idx(miSemana.cambio_peso_rango) >= 0 && conPeso.length + 1 >= k) {
    const signo = yo.intencion === "subir" ? 1 : -1; // "mejor" depende de la intención
    const mios = signo * idx(miSemana.cambio_peso_rango);
    r.cambio_peso = percentil(mios, conPeso.map((s) => signo * idx(s.cambio_peso_rango)).concat([mios]));
  } else {
    r.cambio_peso = null;
  }
  return r;
}

function aliasAleatorio(rand) {
  const a = ALIAS_A[Math.floor(rand() * ALIAS_A.length)];
  const b = ALIAS_B[Math.floor(rand() * ALIAS_B.length)];
  return a + " " + b;
}

function semanaISO(fecha) {
  const d = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate()));
  const dia = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dia);
  const inicio = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const sem = Math.ceil(((d - inicio) / 86400000 + 1) / 7);
  return d.getUTCFullYear() + "-W" + (sem < 10 ? "0" : "") + sem;
}


const USUARIO_RE = /^[a-z][a-z0-9_]{2,31}$/;
const CORREO_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CIFRADO_RE = /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const DISPOSITIVO_RE = /^[a-z0-9-]{8,80}$/;
const SALT_HEX_RE = /^[a-f0-9]{32}$/;
const CONTRASENA_CUENTA_RE = /^v1\.[a-f0-9]{64}$/;

function validarCuentaAlta(body) {
  if (!esObjeto(body)) return err("Cuerpo inválido.");
  const ex = extras(body, ["usuario", "contrasena", "correo", "mayor_de_edad", "acepto_terminos", "version_aviso", "salt_cuenta", "salt_cifrado"]);
  if (ex.length) return err("Campos no permitidos.", ex);
  if (typeof body.usuario !== "string" || !USUARIO_RE.test(body.usuario)) return err("El alias debe tener de 3 a 32 caracteres, empezar con una letra y solo usar letras, números o guion bajo.", ["usuario"]);
  if (typeof body.contrasena !== "string" || !CONTRASENA_CUENTA_RE.test(body.contrasena)) return err("La contraseña de la cuenta debe ir derivada en el dispositivo; no se acepta la contraseña en claro.", ["contrasena"]);
  if (typeof body.salt_cuenta !== "string" || !SALT_HEX_RE.test(body.salt_cuenta)) return err("Falta el salt de la cuenta.", ["salt_cuenta"]);
  if (typeof body.salt_cifrado !== "string" || !SALT_HEX_RE.test(body.salt_cifrado)) return err("Falta el salt de cifrado.", ["salt_cifrado"]);
  if (body.salt_cuenta === body.salt_cifrado) return err("Los dos salts tienen que ser distintos.", ["salt_cifrado"]);
  if (body.correo != null && body.correo !== "") {
    if (typeof body.correo !== "string" || body.correo.length > 200 || !CORREO_RE.test(body.correo)) return err("El correo no es válido.", ["correo"]);
  }
  if (body.mayor_de_edad !== true) return err("La app es solo para mayores de 18 años.", ["mayor_de_edad"]);
  if (body.acepto_terminos !== true) return err("Hay que aceptar los términos y el aviso de privacidad.", ["acepto_terminos"]);
  if (body.version_aviso !== VERSION_AVISO) return err("Falta aceptar la versión vigente del aviso de privacidad.", ["version_aviso"]);
  return { ok: true };
}

function validarSync(body) {
  if (!esObjeto(body)) return err("Cuerpo inválido.");
  const ex = extras(body, ["dispositivo", "version", "datos_cifrados"]);
  if (ex.length) return err("Campos no permitidos.", ex);
  if (typeof body.dispositivo !== "string" || !DISPOSITIVO_RE.test(body.dispositivo)) return err("Dispositivo inválido.", ["dispositivo"]);
  if (!Number.isInteger(body.version) || body.version < 1) return err("La versión debe ser un entero mayor que 0.", ["version"]);
  if (typeof body.datos_cifrados !== "string" || body.datos_cifrados.length < 16 || body.datos_cifrados.length > 500000) return err("El respaldo cifrado no es válido.", ["datos_cifrados"]);
  if (!CIFRADO_RE.test(body.datos_cifrados)) return err("El servidor no acepta datos en claro. El respaldo debe ir cifrado.", ["datos_cifrados"]);
  return { ok: true };
}


function salesFalsas(usuario, secreto, hmac) {
  const digest = (etiqueta) => {
    const h = String(hmac(etiqueta + ":" + usuario, String(secreto || "")));
    if (!/^[a-f0-9]{64}$/i.test(h)) throw new Error("HMAC inválido.");
    return h.slice(0, 32).toLowerCase();
  };
  const salt_cuenta = digest("cuenta");
  let salt_cifrado = digest("cifrado");
  if (salt_cifrado === salt_cuenta) salt_cifrado = digest("cifrado2");
  return { salt_cuenta, salt_cifrado };
}

function resolverVersion(local, remota) {
  const a = Number(local) || 0;
  const b = Number(remota) || 0;
  return a >= b ? a : b;
}

module.exports = {
  VERSION_AVISO, K_MIN, MAX_LISTA, EDADES, ESTATURAS, IMC, INTENCIONES, DIETAS, CAMPOS_PERFIL, INTERRUPTORES, RANGOS_PESO,
  REACCIONES, MOTIVOS, REPORTES_PARA_OCULTAR, DIAS_INACTIVIDAD,
  USUARIO_RE, CONTRASENA_CUENTA_RE,
  extras, validarAlta, validarCuentaAlta, validarSync, salesFalsas, resolverVersion, validarPerfil, validarSemana, parecido, puntaje, match, percentil, comparar, aliasAleatorio, semanaISO,
};

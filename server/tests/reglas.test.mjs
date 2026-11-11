// Pruebas unitarias de las reglas puras (sin servidor).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const R = createRequire(import.meta.url)("../pb_hooks/lib/reglas.js");

const base = { intencion: "bajar", imc_cat: "sobrepeso", edad_rango: "25-29", dieta: "omnivora", ejercicios: ["Squat"] };
const persona = (i, extra) => Object.assign({ usuario: "u" + i, alias: "A" + i }, base, extra || {});

test("alta exige mayoría de edad, consentimiento vigente y rechaza campos extra", () => {
  const ok = { clave: "x".repeat(40), mayor_de_edad: true, consentimiento: { acepto: true, version_aviso: R.VERSION_AVISO } };
  assert.equal(R.validarAlta(ok).ok, true);
  assert.equal(R.validarAlta({ ...ok, mayor_de_edad: false }).ok, false);
  assert.equal(R.validarAlta({ ...ok, consentimiento: { acepto: true, version_aviso: "viejo" } }).ok, false);
  assert.deepEqual(R.validarAlta({ ...ok, peso: 70 }).campos, ["peso"]);
  assert.equal(R.validarAlta({ ...ok, clave: "corta" }).ok, false);
});

test("perfil: todo apagado por defecto y campos prohibidos rechazados", () => {
  const v = R.validarPerfil({ visibles: {}, intencion: "bajar" });
  assert.equal(v.ok, true);
  assert.equal(v.valor.intencion, "");
  assert.ok(Object.values(v.visibles).every((x) => x === false));
  for (const prohibido of ["peso", "estatura", "edad", "padecimientos", "medicamentos", "alergias", "nombre", "email"]) {
    const r = R.validarPerfil({ visibles: {}, [prohibido]: 1 });
    assert.equal(r.ok, false, prohibido);
    assert.deepEqual(r.campos, [prohibido]);
  }
  assert.equal(R.validarPerfil({ visibles: { peso: true } }).ok, false);
  assert.equal(R.validarPerfil({ visibles: { cambio_peso: true } }).ok, false); // interruptor viejo
});

test("perfil: el cambio de peso exige consentimiento expreso aparte (dato sensible)", () => {
  const vis = { progreso: true, cambio_peso_rango: true };
  const c = { acepto: true, version_aviso: R.VERSION_AVISO };
  assert.ok(R.INTERRUPTORES.includes("cambio_peso_rango"));
  assert.equal(R.validarPerfil({ visibles: {} }).visibles.cambio_peso_rango, false); // apagado por defecto
  const sin = R.validarPerfil({ visibles: vis }, {});
  assert.equal(sin.ok, false);
  assert.deepEqual(sin.campos, ["consentimiento_sensible"]);
  const con = R.validarPerfil({ visibles: vis, consentimiento_sensible: c }, {});
  assert.equal(con.ok, true);
  assert.equal(con.sensible, true);
  assert.equal(R.validarPerfil({ visibles: vis }, { cambio_peso_rango: true }).ok, true); // ya lo había dado
  assert.equal(R.validarPerfil({ visibles: vis, consentimiento_sensible: { acepto: false, version_aviso: R.VERSION_AVISO } }, {}).ok, false);
  assert.equal(R.validarPerfil({ visibles: vis, consentimiento_sensible: { ...c, extra: 1 } }, {}).ok, false);
  assert.equal(R.validarPerfil({ visibles: vis, consentimiento_sensible: { ...c, version_aviso: "2020-01-01" } }, {}).ok, false);
  assert.equal(R.validarPerfil({ visibles: { edad_rango: true }, edad_rango: "15-17" }).ok, false);
  assert.equal(R.validarPerfil({ visibles: { ejercicios: true }, ejercicios: ["a", "b", "c", "d", "e", "f"] }).ok, false);
  assert.equal(R.validarPerfil({ visibles: { ejercicios: true }, ejercicios: ["<script>"] }).ok, false);
});

test("semana: requiere progreso activo; peso solo como rango permitido, nunca número", () => {
  const s = { semana: "2026-W46", pct_habitos: 70, racha: 9 };
  const vis = { progreso: true, cambio_peso_rango: true };
  assert.equal(R.validarSemana(s, { progreso: false }).ok, false);
  assert.equal(R.validarSemana({ ...s, cambio_peso_rango: "-2..-1%" }, { progreso: true }).ok, false); // interruptor apagado
  assert.equal(R.validarSemana({ ...s, cambio_peso_rango: "-2..-1%" }, vis).valor.cambio_peso_rango, "-2..-1%");
  assert.equal(R.validarSemana(s, vis).valor.cambio_peso_rango, "");
  for (const malo of [-1.3, -1, "-1.3", "-1.3%", "-2..-1", "", true, ["-2..-1%"], { r: "-2..-1%" }]) {
    assert.equal(R.validarSemana({ ...s, cambio_peso_rango: malo }, vis).ok, false, JSON.stringify(malo));
  }
  const viejo = R.validarSemana({ ...s, cambio_peso_pct: -1.3 }, vis);
  assert.equal(viejo.ok, false);
  assert.deepEqual(viejo.campos, ["cambio_peso_pct"]);
  assert.equal(R.validarSemana({ ...s, peso_kg: 70 }, { progreso: true }).ok, false);
  assert.equal(R.validarSemana({ ...s, pct_habitos: 101 }, { progreso: true }).ok, false);
});

test("match: k-anonimato (4 personas no alcanza, 5 sí) y sin medidas", () => {
  const yo = persona(0);
  assert.equal(R.match(yo, [1, 2, 3].map((i) => persona(i))).suficiente, false);
  const m = R.match(yo, [1, 2, 3, 4].map((i) => persona(i)));
  assert.equal(m.suficiente, true);
  assert.equal(m.n, 5);
  for (const c of m.candidatos) for (const k of ["peso", "estatura", "estatura_rango", "edad"]) assert.ok(!(k in c));
});

test("match: intención distinta, IMC lejano o sin afinidad quedan fuera; vecinos entran", () => {
  const yo = persona(0);
  assert.equal(R.parecido(yo, persona(1, { intencion: "subir" })), false);
  assert.equal(R.parecido(yo, persona(1, { imc_cat: "bajo" })), false);
  assert.equal(R.parecido(yo, persona(1, { imc_cat: "obesidad", edad_rango: "30-34" })), true);
  assert.equal(R.parecido(yo, persona(1, { ejercicios: ["Run"], dieta: "vegana" })), false);
  assert.equal(R.parecido(yo, persona(1, { ejercicios: ["Run"] })), true); // misma dieta
});

test("match: máximo 10 candidatos ordenados por puntaje", () => {
  const otros = Array.from({ length: 20 }, (_, i) => persona(i + 1, i === 7 ? { ejercicios: ["Squat", "Run"] } : { dieta: "vegana" }));
  const m = R.match(persona(0, { ejercicios: ["Squat", "Run"] }), otros);
  assert.equal(m.candidatos.length, 10);
  assert.equal(m.candidatos[0].usuario, "u8");
});

test("percentiles y comparación", () => {
  assert.equal(R.percentil(5, [1, 3, 5, 7, 9]), 50);
  const rangos = ["-1..0%", "-2..-1%", "-3..-2%", "-4..-3%"];
  const otras = [10, 20, 30, 40].map((p, i) => ({ pct_habitos: p, racha: p, cambio_peso_rango: rangos[i] }));
  assert.equal(R.comparar(base, { pct_habitos: 50, racha: 1 }, otras.slice(0, 3)).suficiente, false);
  const r = R.comparar(base, { pct_habitos: 50, racha: 1, cambio_peso_rango: "<-5%" }, otras);
  assert.equal(r.habitos, 90);
  assert.equal(r.cambio_peso, 90); // bajar: más negativo es "mejor"
  assert.equal(R.comparar({ ...base, imc_cat: "bajo" }, { pct_habitos: 50, racha: 1, cambio_peso_rango: "<-5%" }, otras).cambio_peso, null);
  assert.equal(R.comparar({ ...base, intencion: "subir" }, { pct_habitos: 50, racha: 1, cambio_peso_rango: "<-5%" }, otras).cambio_peso, 10);
  assert.deepEqual(Object.keys(r).sort(), ["cambio_peso", "habitos", "n", "racha", "suficiente"]);
});

test("semana ISO", () => {
  assert.equal(R.semanaISO(new Date("2026-11-11T12:00:00Z")), "2026-W46");
  assert.equal(R.semanaISO(new Date("2027-01-01T12:00:00Z")), "2026-W53");
});

test("cuenta: 18+, términos, aviso vigente y alias válido", () => {
  const ok = { usuario: "ajolote", contrasena: "secreto12", mayor_de_edad: true, acepto_terminos: true, version_aviso: R.VERSION_AVISO };
  assert.equal(R.validarCuentaAlta(ok).ok, true);
  assert.equal(R.validarCuentaAlta({ ...ok, correo: "a@b.com" }).ok, true);
  assert.equal(R.validarCuentaAlta({ ...ok, mayor_de_edad: false }).ok, false);
  assert.equal(R.validarCuentaAlta({ ...ok, acepto_terminos: false }).ok, false);
  assert.equal(R.validarCuentaAlta({ ...ok, version_aviso: "viejo" }).ok, false);
  assert.equal(R.validarCuentaAlta({ ...ok, usuario: "Ab" }).ok, false);
  assert.equal(R.validarCuentaAlta({ ...ok, contrasena: "corta" }).ok, false);
  assert.deepEqual(R.validarCuentaAlta({ ...ok, peso: 70 }).campos, ["peso"]);
});

test("sync: solo blob cifrado, versión entera y sin campos extra", () => {
  const ok = { dispositivo: "11111111-1111-1111-1111-111111111111", version: 1, datos_cifrados: "v1.YWJjZGVmZ2hpams.YWJjZGVmZ2hpag" };
  assert.equal(R.validarSync(ok).ok, true);
  assert.equal(R.validarSync({ ...ok, datos_cifrados: JSON.stringify({ perfil: { peso: 70 } }) }).ok, false);
  assert.equal(R.validarSync({ ...ok, version: 0 }).ok, false);
  assert.deepEqual(R.validarSync({ ...ok, peso: 70 }).campos, ["peso"]);
  assert.equal(R.resolverVersion(3, 5), 5);
  assert.equal(R.resolverVersion(7, 5), 7);
  assert.equal(R.resolverVersion(2, 2), 2);
});

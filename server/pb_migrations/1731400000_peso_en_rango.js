/// <reference path="../pb_data/types.d.ts" />
// El cambio de peso es dato de salud (sensible en la LFPDPPP). Esta migración:
// 1. Borra la columna progreso_semanal.cambio_peso_pct (porcentaje exacto) con todos sus valores.
//    No se convierten a rango porque se compartieron sin el consentimiento expreso que ahora se pide.
// 2. Agrega progreso_semanal.cambio_peso_rango: solo rangos de 1 % calculados en el cliente.
// 3. Apaga el interruptor en todos los perfiles (el viejo «cambio_peso» desaparece). Volver a activarlo
//    exige el consentimiento expreso nuevo, que se registra en consentimientos.consentimiento_sensible.
const RANGOS_PESO = ["<-5%", "-5..-4%", "-4..-3%", "-3..-2%", "-2..-1%", "-1..0%", "0..1%", "1..2%", "2..3%", "3..4%", "4..5%", ">=5%"];

migrate((app) => {
  const ps = app.findCollectionByNameOrId("progreso_semanal");
  ps.fields.removeByName("cambio_peso_pct");
  ps.fields.add(new SelectField({ name: "cambio_peso_rango", maxSelect: 1, values: RANGOS_PESO }));
  app.save(ps);

  const cs = app.findCollectionByNameOrId("consentimientos");
  cs.fields.add(new BoolField({ name: "consentimiento_sensible" }));
  app.save(cs);

  app.findAllRecords("perfil_publico").forEach((r) => {
    let v = {};
    try { v = JSON.parse(r.getString("visibles") || "{}") || {}; } catch (_) { v = {}; }
    delete v.cambio_peso;
    v.cambio_peso_rango = false;
    r.set("visibles", v);
    app.save(r);
  });
}, (app) => {
  // Reversa del esquema solamente: los porcentajes exactos borrados no se recuperan.
  const ps = app.findCollectionByNameOrId("progreso_semanal");
  ps.fields.removeByName("cambio_peso_rango");
  ps.fields.add(new NumberField({ name: "cambio_peso_pct", min: -30, max: 30 }));
  app.save(ps);
  const cs = app.findCollectionByNameOrId("consentimientos");
  cs.fields.removeByName("consentimiento_sensible");
  app.save(cs);
  app.findAllRecords("perfil_publico").forEach((r) => {
    let v = {};
    try { v = JSON.parse(r.getString("visibles") || "{}") || {}; } catch (_) { v = {}; }
    delete v.cambio_peso_rango;
    v.cambio_peso = false;
    r.set("visibles", v);
    app.save(r);
  });
});

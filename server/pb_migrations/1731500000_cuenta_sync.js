/// <reference path="../pb_data/types.d.ts" />
// F5.0: cuentas de la app reutilizan usuarios; respaldo cifrado de extremo a extremo.
migrate((app) => {
  const usuarios = app.findCollectionByNameOrId("usuarios");
  const un = usuarios.fields.getByName("username");
  un.min = 3;
  un.max = 32;
  un.pattern = "^[a-z0-9_]{3,32}$";
  usuarios.passwordAuth.identityFields = ["username", "email"];
  usuarios.fields.add(new TextField({ name: "sync_salt", min: 32, max: 64, pattern: "^[a-f0-9]+$" }));
  app.save(usuarios);

  const rel = (name, col) => ({
    name, type: "relation", required: true, collectionId: col.id, cascadeDelete: true, maxSelect: 1,
  });
  app.save(new Collection({
    type: "base",
    name: "respaldo_sync",
    listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
    fields: [
      rel("usuario", usuarios),
      { name: "dispositivo", type: "text", required: true, min: 8, max: 80, pattern: "^[a-z0-9-]+$" },
      { name: "version", type: "number", required: true, min: 1, onlyInt: true },
      { name: "datos_cifrados", type: "text", required: true, max: 500000 },
      { name: "actualizado", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: [
      "CREATE INDEX idx_sync_usuario_version ON respaldo_sync (usuario, version)",
    ],
  }));
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId("respaldo_sync")); } catch (_) {}
  const usuarios = app.findCollectionByNameOrId("usuarios");
  usuarios.fields.removeByName("sync_salt");
  const un = usuarios.fields.getByName("username");
  un.min = 16;
  un.max = 40;
  un.pattern = "^[a-z0-9]+$";
  usuarios.passwordAuth.identityFields = ["username"];
  app.save(usuarios);
});

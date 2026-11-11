/// <reference path="../pb_data/types.d.ts" />
// F5.0: salt distinto para derivar la contraseña que se manda a PocketBase.
migrate((app) => {
  const usuarios = app.findCollectionByNameOrId("usuarios");
  usuarios.fields.add(new TextField({ name: "auth_salt", min: 32, max: 64, pattern: "^[a-f0-9]+$" }));
  app.save(usuarios);
}, (app) => {
  const usuarios = app.findCollectionByNameOrId("usuarios");
  usuarios.fields.removeByName("auth_salt");
  app.save(usuarios);
});

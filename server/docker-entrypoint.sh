#!/bin/sh
# Arranca PocketBase con las rutas de la imagen. Cualquier otro comando se pasa tal cual
# (p. ej. `superuser upsert ...` o `migrate`).
set -eu
PB="/pb/pocketbase"
COMUNES="--dir=/pb/pb_data --hooksDir=/pb/pb_hooks --migrationsDir=/pb/pb_migrations --publicDir=/pb/pb_public"
# La llave cifra los ajustes; todos los comandos deben usarla.
[ -n "${PB_ENCRYPTION_KEY:-}" ] && COMUNES="$COMUNES --encryptionEnv=PB_ENCRYPTION_KEY"
if [ "${1:-serve}" = "serve" ]; then
  shift || true
  # La PWA y la API comparten origen, así que CORS queda cerrado. PROGRESSIUM_ORIGINS solo
  # sirve para desarrollo (p. ej. http://localhost:4200); vacío = ningún origen externo.
  ORIGENES="${PROGRESSIUM_ORIGINS:-https://cors-cerrado.invalid}"
  # shellcheck disable=SC2086
  exec "$PB" serve --http=0.0.0.0:8090 --origins="$ORIGENES" --hooksWatch=false $COMUNES "$@"
fi
if [ "$1" = "admin-upsert" ]; then
  # Lee la contraseña por stdin para que no quede en el historial ni en `docker inspect`.
  IFS= read -r PASS || true
  if [ -z "${PB_ADMIN_EMAIL:-}" ] || [ -z "${PASS:-}" ]; then echo "Falta PB_ADMIN_EMAIL o la contraseña por stdin" >&2; exit 2; fi
  # shellcheck disable=SC2086
  "$PB" superuser upsert "$PB_ADMIN_EMAIL" "$PASS" $COMUNES >/dev/null
  echo "Superusuario listo: $PB_ADMIN_EMAIL"
  exit 0
fi
# shellcheck disable=SC2086
exec "$PB" "$@" $COMUNES

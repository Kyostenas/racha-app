#!/usr/bin/env bash
# Copia consistente de la base (sqlite .backup) fuera del contenedor, comprimida y rotada.
# Si RESPALDO_AGE_RECIPIENT está definido y existe `age`, se cifra.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a
# shellcheck disable=SC1091
. ./.env
set +a
if docker compose version >/dev/null 2>&1; then DC=(docker compose); else DC=(docker-compose); fi
DIR="${RESPALDO_DIR:-./respaldos}"; MANTENER="${RESPALDO_MANTENER:-7}"
mkdir -p "$DIR"; umask 077
NOMBRE="progressium-$(date +%Y%m%d-%H%M%S).db"
"${DC[@]}" exec -T progressium sqlite3 /pb/pb_data/data.db ".backup '/pb/pb_data/_respaldo.db'"
"${DC[@]}" exec -T progressium cat /pb/pb_data/_respaldo.db | gzip -9 >"$DIR/$NOMBRE.gz"
"${DC[@]}" exec -T progressium rm -f /pb/pb_data/_respaldo.db
if [ -n "${RESPALDO_AGE_RECIPIENT:-}" ] && command -v age >/dev/null; then
  age -r "$RESPALDO_AGE_RECIPIENT" -o "$DIR/$NOMBRE.gz.age" "$DIR/$NOMBRE.gz" && rm -f "$DIR/$NOMBRE.gz"
fi
find "$DIR" -maxdepth 1 -name "progressium-*.db.gz*" -printf "%T@ %p\n" | sort -rn | cut -d" " -f2-  | tail -n +$((MANTENER + 1)) | xargs -r rm -f
echo "$(date -Iseconds) respaldo $NOMBRE"

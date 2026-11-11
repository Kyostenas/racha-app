#!/usr/bin/env bash
# Restaura un respaldo hecho con respaldo.sh:  ./scripts/restaurar.sh respaldos/progresium-AAAAMMDD-HHMMSS.db.gz
set -euo pipefail
cd "$(dirname "$0")/.."
ARCH="${1:?Indica el archivo de respaldo}"
if docker compose version >/dev/null 2>&1; then DC=(docker compose); else DC=(docker-compose); fi
case "$ARCH" in *.age) echo "Descífralo primero con: age -d -i TU_LLAVE $ARCH > respaldo.db.gz" >&2; exit 2 ;; esac
"${DC[@]}" stop progresium
gzip -dc "$ARCH" | "${DC[@]}" run --rm -T --entrypoint sh progresium -c 'cat > /pb/pb_data/data.db && rm -f /pb/pb_data/data.db-wal /pb/pb_data/data.db-shm'
"${DC[@]}" up -d progresium
echo "Restaurado $ARCH"

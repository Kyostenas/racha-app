#!/usr/bin/env bash
# Instala o actualiza el servidor de la comunidad de Progresium en cualquier Linux con Docker
# (celular con chroot, VPS o laptop). Es idempotente: se puede correr las veces que haga falta.
#
#   ./install.sh [--origins URL1,URL2] [--tag vX.Y.Z] [--build] [--sin-cron] [--puerto 8090]
#
# Nunca imprime secretos: la contraseña del panel queda en secretos/admin.txt (permisos 600).
set -euo pipefail
cd "$(dirname "$0")"

ORIGINS="" TAG="" BUILD=0 CRON=1 PUERTO=""
while [ $# -gt 0 ]; do
  case "$1" in
    --origins) ORIGINS="$2"; shift 2 ;;
    --tag) TAG="$2"; shift 2 ;;
    --puerto) PUERTO="$2"; shift 2 ;;
    --build) BUILD=1; shift ;;
    --sin-cron) CRON=0; shift ;;
    -h|--help) sed -n '2,8p' "$0"; exit 0 ;;
    *) echo "Opción desconocida: $1" >&2; exit 2 ;;
  esac
done

log() { printf '\033[1m[progresium]\033[0m %s\n' "$*"; }
command -v docker >/dev/null || { echo "Necesitas Docker instalado." >&2; exit 1; }
if docker compose version >/dev/null 2>&1; then DC=(docker compose)
elif command -v docker-compose >/dev/null; then DC=(docker-compose)
else echo "Necesitas Docker Compose (plugin 'docker compose' o 'docker-compose')." >&2; exit 1; fi

aleatorio() { tr -dc 'A-Za-z0-9' </dev/urandom | head -c "$1" || true; }
# Asigna KEY=VALOR en .env. Si $3 = "si-vacio", solo cuando está vacío o no existe.
poner() {
  local k="$1" v="$2" modo="${3:-}" actual
  actual="$(grep -E "^$k=" .env | head -1 | cut -d= -f2- || true)"
  if [ "$modo" = "si-vacio" ] && [ -n "$actual" ]; then return; fi
  if grep -qE "^$k=" .env; then
    local tmp; tmp="$(mktemp)"; awk -v k="$k" -v v="$v" -F= 'BEGIN{OFS="="} $1==k{print k"="v; next} {print}' .env >"$tmp"; cat "$tmp" >.env; rm -f "$tmp"
  else echo "$k=$v" >>.env; fi
}

umask 077
[ -f .env ] || { cp .env.example .env; log "Creado .env a partir de .env.example"; }
chmod 600 .env
poner PB_ENCRYPTION_KEY "$(aleatorio 32)" si-vacio
[ -n "$ORIGINS" ] && poner PROGRESIUM_ORIGINS "$ORIGINS"
[ -n "$TAG" ] && poner PROGRESIUM_TAG "$TAG"
[ -n "$PUERTO" ] && poner PROGRESIUM_PORT "$PUERTO"
set -a
# shellcheck disable=SC1091
. ./.env
set +a

mkdir -p secretos "${RESPALDO_DIR:-./respaldos}"
chmod 700 secretos
if [ ! -s secretos/admin.txt ]; then aleatorio 32 >secretos/admin.txt; log "Contraseña del panel generada en secretos/admin.txt"; fi
chmod 600 secretos/admin.txt

if [ "$BUILD" = 1 ]; then
  log "Construyendo la imagen localmente…"; "${DC[@]}" build
else
  log "Descargando ${PROGRESIUM_IMAGE}:${PROGRESIUM_TAG}…"
  "${DC[@]}" pull || { log "No se pudo descargar; construyendo localmente."; "${DC[@]}" build; }
fi

log "Aplicando migraciones y superusuario…"
"${DC[@]}" run --rm -T -e PB_ADMIN_EMAIL="${PB_ADMIN_EMAIL}" progresium admin-upsert <secretos/admin.txt
"${DC[@]}" up -d --remove-orphans

URL="http://127.0.0.1:${PROGRESIUM_PORT:-8090}/api/health"
for i in $(seq 1 60); do
  if (command -v curl >/dev/null && curl -fsS "$URL" >/dev/null 2>&1) || (command -v wget >/dev/null && wget -qO- "$URL" >/dev/null 2>&1); then
    log "Servidor sano en $URL"; break
  fi
  [ "$i" = 60 ] && { echo "El servidor no respondió en $URL" >&2; "${DC[@]}" logs --tail 30 progresium >&2; exit 1; }
  sleep 1
done

chmod +x scripts/*.sh
if [ "$CRON" = 1 ] && command -v crontab >/dev/null; then
  LINEA="40 3 * * * cd $(pwd) && ./scripts/respaldo.sh >>respaldos/respaldo.log 2>&1 # progresium-respaldo"
  ( crontab -l 2>/dev/null | grep -v '# progresium-respaldo' || true; echo "$LINEA" ) | crontab -
  log "Respaldo diario programado (03:40) con crontab."
else
  log "Respaldo del host sin programar (usa cron o systemd para ./scripts/respaldo.sh). PocketBase además guarda respaldos internos diarios."
fi
./scripts/respaldo.sh >/dev/null && log "Primer respaldo listo en ${RESPALDO_DIR:-./respaldos}"
log "Listo. Panel: http://127.0.0.1:${PROGRESIUM_PORT:-8090}/_/ (usuario ${PB_ADMIN_EMAIL}, contraseña en secretos/admin.txt)"

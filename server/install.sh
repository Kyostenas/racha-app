#!/usr/bin/env bash
# Instala o actualiza el servidor de la comunidad de Progressium en cualquier Linux con Docker
# (celular con chroot, VPS o laptop). Es idempotente: se puede correr las veces que haga falta.
#
#   ./install.sh [--tag vX.Y.Z] [--build] [--sin-cron] [--puerto 8090] [--funnel] [--origins-dev URL1,URL2]
#
# Sirve la PWA y la API en el mismo origen (http://127.0.0.1:8090/). --build necesita el repo completo.
#
# Nunca imprime secretos: la contraseña del panel queda en secretos/admin.txt (permisos 600).
set -euo pipefail
cd "$(dirname "$0")"

ORIGINS="" TAG="" BUILD=0 CRON=1 PUERTO="" FUNNEL=0
while [ $# -gt 0 ]; do
  case "$1" in
    --origins-dev) ORIGINS="$2"; shift 2 ;;
    --tag) TAG="$2"; shift 2 ;;
    --puerto) PUERTO="$2"; shift 2 ;;
    --build) BUILD=1; shift ;;
    --sin-cron) CRON=0; shift ;;
    --funnel) FUNNEL=1; shift ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *) echo "Opción desconocida: $1" >&2; exit 2 ;;
  esac
done

log() { printf '\033[1m[progressium]\033[0m %s\n' "$*"; }
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
[ -n "$ORIGINS" ] && poner PROGRESSIUM_ORIGINS "$ORIGINS"
[ -n "$TAG" ] && poner PROGRESSIUM_TAG "$TAG"
[ -n "$PUERTO" ] && poner PROGRESSIUM_PORT "$PUERTO"
# TS_AUTHKEY puede llegar por el entorno (sin escribirse en disco); tiene prioridad sobre .env.
TS_AUTHKEY_ENTORNO="${TS_AUTHKEY:-}"
set -a
# shellcheck disable=SC1091
. ./.env
set +a
if [ -n "$TS_AUTHKEY_ENTORNO" ]; then TS_AUTHKEY="$TS_AUTHKEY_ENTORNO"; export TS_AUTHKEY; fi
unset TS_AUTHKEY_ENTORNO

mkdir -p secretos "${RESPALDO_DIR:-./respaldos}"
chmod 700 secretos
if [ ! -s secretos/admin.txt ]; then aleatorio 32 >secretos/admin.txt; log "Contraseña del panel generada en secretos/admin.txt"; fi
chmod 600 secretos/admin.txt

if [ "$BUILD" = 1 ]; then
  log "Construyendo la imagen localmente…"; "${DC[@]}" build
else
  log "Descargando ${PROGRESSIUM_IMAGE}:${PROGRESSIUM_TAG}…"
  "${DC[@]}" pull || { log "No se pudo descargar; construyendo localmente."; "${DC[@]}" build; }
fi

log "Aplicando migraciones y superusuario…"
"${DC[@]}" run --rm -T -e PB_ADMIN_EMAIL="${PB_ADMIN_EMAIL}" progressium admin-upsert <secretos/admin.txt
"${DC[@]}" up -d --remove-orphans

URL="http://127.0.0.1:${PROGRESSIUM_PORT:-8090}/api/health"
for i in $(seq 1 60); do
  if (command -v curl >/dev/null && curl -fsS "$URL" >/dev/null 2>&1) || (command -v wget >/dev/null && wget -qO- "$URL" >/dev/null 2>&1); then
    log "Servidor sano en $URL"; break
  fi
  [ "$i" = 60 ] && { echo "El servidor no respondió en $URL" >&2; "${DC[@]}" logs --tail 30 progressium >&2; exit 1; }
  sleep 1
done

if [ -n "${TS_AUTHKEY:-}" ] || [ "$FUNNEL" = 1 ]; then
  log "Levantando el nodo de Tailscale «${TS_HOSTNAME:-progressium}» con Funnel…"
  "${DC[@]}" --profile funnel up -d tailscale
  for i in $(seq 1 60); do
    if "${DC[@]}" --profile funnel exec -T tailscale tailscale status --json 2>/dev/null | grep -q '"BackendState": *"Running"'; then
      DOMINIO="$("${DC[@]}" --profile funnel exec -T tailscale tailscale status --json --peers=false | sed -n 's/.*"DNSName": *"\([^"]*\)\.".*/\1/p' | head -1)"
      log "Nodo unido. URL pública: https://${DOMINIO}/ (si el tailnet permite Funnel)"; break
    fi
    [ "$i" = 60 ] && log "El nodo no quedó listo; revisa: docker compose --profile funnel logs tailscale"
    sleep 2
  done
else
  log "Funnel apagado (sin TS_AUTHKEY). La app queda en http://127.0.0.1:${PROGRESSIUM_PORT:-8090}/"
fi

chmod +x scripts/*.sh
if [ "$CRON" = 1 ] && command -v crontab >/dev/null; then
  LINEA="40 3 * * * cd $(pwd) && ./scripts/respaldo.sh >>respaldos/respaldo.log 2>&1 # progressium-respaldo"
  ( crontab -l 2>/dev/null | grep -v '# progressium-respaldo' || true; echo "$LINEA" ) | crontab -
  log "Respaldo diario programado (03:40) con crontab."
else
  log "Respaldo del host sin programar (usa cron o systemd para ./scripts/respaldo.sh). PocketBase además guarda respaldos internos diarios."
fi
./scripts/respaldo.sh >/dev/null && log "Primer respaldo listo en ${RESPALDO_DIR:-./respaldos}"
log "Listo. App: http://127.0.0.1:${PROGRESSIUM_PORT:-8090}/ · Panel: http://127.0.0.1:${PROGRESSIUM_PORT:-8090}/_/ (usuario ${PB_ADMIN_EMAIL}, contraseña en secretos/admin.txt)"

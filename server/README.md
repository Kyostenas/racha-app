# Progressium · imagen de la instancia (PWA + comunidad)

Una sola imagen Docker multi-arch (amd64 + arm64) sirve, **en el mismo origen**:

- `/` la PWA de Progressium (build de Angular en `pb_public`, instalable: manifest + service worker),
- `/aviso-privacidad.html` el aviso de privacidad de la comunidad,
- `/api/progressium/*` la API de la comunidad (PocketBase 0.40 + `pb_migrations/` + `pb_hooks/`),
- `/_/` el panel de administración (solo superusuario).

La app usa rutas relativas (`/api/...`): no hay ninguna URL de servidor configurable. CORS queda cerrado.
La PWA funciona igual sin la comunidad (offline-first); la comunidad es opt-in, solo para mayores de 18 y
todo empieza apagado.

## Instalar en cualquier Linux con Docker (celular con chroot, VPS o laptop)

```bash
git clone https://github.com/Kyostenas/racha-app && cd racha-app/server
./install.sh                 # descarga ghcr.io/kyostenas/progressium:latest (amd64/arm64)
./install.sh --tag v0.3.0    # una versión fija
./install.sh --build         # o construir aquí (PWA + servidor) desde el repo
```

`install.sh` es idempotente: crea `.env` (sin pisar valores), la llave de cifrado de ajustes, la contraseña del
panel en `secretos/admin.txt` (600, nunca se imprime), el volumen `progressium_datos`, aplica migraciones,
levanta el contenedor (256 MB, solo `127.0.0.1:8090`, sistema de archivos de solo lectura, sin capacidades),
espera `/api/health` y deja el respaldo diario (`scripts/respaldo.sh`, crontab si existe) además del respaldo
interno de PocketBase. Restaurar: `./scripts/restaurar.sh respaldos/progressium-….db.gz`.

Imagen: `ghcr.io/kyostenas/progressium:<versión>` y `:latest`, publicada por `.github/workflows/server.yml` al
crear un tag `vX.Y.Z` (o un release / ejecución manual).

## Publicar con HTTPS (la URL pública no cambia)

El contenedor solo escucha en `127.0.0.1:8090`. En el Moto se publica con **Tailscale Funnel** desde un nodo
`progressium` en el chroot (la app oficial de Android no tiene Funnel):

```bash
# 1) tailscaled propio, en modo userspace, con su propio estado y socket
sudo mkdir -p /var/lib/tailscale-progressium /run/tailscale-progressium
sudo tailscaled --tun=userspace-networking \
  --state=/var/lib/tailscale-progressium/tailscaled.state \
  --socket=/run/tailscale-progressium/tailscaled.sock --port=0 &
# 2) Unir el nodo (abre un enlace para iniciar sesión en el tailnet)
sudo tailscale --socket=/run/tailscale-progressium/tailscaled.sock up --hostname=progressium
# 3) Publicar
sudo tailscale --socket=/run/tailscale-progressium/tailscaled.sock funnel --bg 8090
```

URL: `https://progressium.tail2ca124.ts.net/`. Requiere que el admin del tailnet permita Funnel en la política
(`nodeAttrs` con `funnel`). Plan B: Cloudflare Tunnel con nombre hacia `http://127.0.0.1:8090`.

## API (`/api/progressium/*`)

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/estado` | versión, versión del aviso, k mínimo |
| POST | `/alta` | cuenta anónima `{clave, mayor_de_edad:true, consentimiento:{acepto, version_aviso}}` → `{usuario, alias}`; luego `POST /api/collections/usuarios/auth-with-password` |
| GET | `/yo` | cuenta y perfil público propio |
| PUT | `/perfil` | rangos + `visibles` (interruptores; apagar borra el dato) |
| PUT | `/semana` | `{semana, pct_habitos, racha, cambio_peso_pct?}` |
| GET | `/match`, `/comparar` | solo si el grupo parecido tiene ≥ 5 personas |
| GET/POST/PATCH/DELETE | `/conexiones[/{id}]`, `/conexiones/{id}/progreso` | solicitar, aceptar, rechazar, quitar, ver progreso |
| POST | `/bloquear`, `/reportar` | moderación (3 reportes de personas distintas ocultan el perfil) |
| GET/POST/PUT/DELETE | `/retos`, `/retos/{clave}/unirse`, `/retos/{clave}/avance`, `/retos/{clave}` | retos semanales |
| GET/POST | `/feed`, `/reacciones` | eventos de la app y reacciones de una lista cerrada |
| GET | `/exportar` | todo lo que el servidor tiene de la cuenta |
| DELETE | `/cuenta` | borra la cuenta y todo en cascada |

La API genérica de colecciones está cerrada (reglas `null`); cualquier campo fuera de la lista permitida
responde 400. Peso, estatura, edad exacta, padecimientos, medicamentos y alergias no tienen dónde guardarse.

## Pruebas

```bash
node --test tests/reglas.test.mjs                                   # reglas puras
PB_URL=http://127.0.0.1:8090 PB_SU_EMAIL=admin@progressium.local \
  PB_SU_PASSWORD="$(cat secretos/admin.txt)" node --test tests/api.test.mjs
cd .. && E2E_COMUNIDAD_URL=http://127.0.0.1:8090 npx playwright test e2e/comunidad.spec.ts   # e2e + axe
```

# Progresium · servidor de la comunidad (opcional)

PocketBase 0.40 + migraciones + rutas propias (`pb_hooks/`). La PWA funciona igual sin este servidor;
solo lo usa la pantalla **Comunidad** (opt-in, mayores de 18, todo apagado de inicio).
Plan y decisiones: `plan_comunidad.md` en el repo del documento del proyecto.

## Instalar en cualquier Linux con Docker (celular con chroot, VPS o laptop)

```bash
git clone https://github.com/Kyostenas/racha-app && cd racha-app/server
./install.sh --origins https://kyostenas.github.io          # imagen de GHCR (amd64/arm64)
./install.sh --build                                         # o construir aquí mismo
```

`install.sh` es idempotente: crea `.env` (sin pisar valores), la llave de cifrado de ajustes, la contraseña del
panel en `secretos/admin.txt` (600, nunca se imprime), el volumen `progresium_datos`, aplica migraciones,
levanta el contenedor (256 MB, solo `127.0.0.1:8090`, sistema de archivos de solo lectura, sin capacidades),
espera `/api/health` y deja el respaldo diario (`scripts/respaldo.sh`, crontab si existe) además del respaldo
interno de PocketBase. Restaurar: `./scripts/restaurar.sh respaldos/progresium-….db.gz`.

Imagen: `ghcr.io/kyostenas/progresium-server:<versión>` y `:latest`, publicada por
`.github/workflows/server.yml` al crear un tag `server-vX.Y.Z` (o un release / ejecución manual).

## Publicar con HTTPS

El contenedor solo escucha en `127.0.0.1`. Para que la PWA (GitHub Pages) lo alcance:

- **Tailscale Funnel** (recomendado, $0): la app de Tailscale para Android no tiene Funnel, así que en el chroot se
  corre un `tailscaled` aparte en modo userspace como nodo `progresium` y luego
  `tailscale --socket=… funnel --bg 8090`. Requiere que el admin del tailnet active Funnel en la política.
- **Cloudflare Tunnel** con nombre (plan B): `cloudflared tunnel` hacia `http://127.0.0.1:8090`.

Agrega el origen exacto de la PWA en `PROGRESIUM_ORIGINS` (CORS) y vuelve a correr `./install.sh`.

## API (`/api/progresium/*`)

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/estado` | versión, versión del aviso, k mínimo |
| POST | `/alta` | cuenta anónima `{clave, mayor_de_edad:true, consentimiento:{acepto, version_aviso}}` → `{usuario, alias}`; luego `POST /api/collections/usuarios/auth-with-password` |
| GET | `/yo` | cuenta y perfil público propio |
| PUT | `/perfil` | rangos + `visibles` (interruptores; apagar borra el dato) |
| PUT | `/semana` | `{semana, pct_habitos, racha, cambio_peso_pct?}` |
| GET | `/match`, `/comparar` | solo si el grupo parecido tiene ≥ 5 personas |
| GET/POST/PATCH/DELETE | `/conexiones[/{id}]`, `/conexiones/{id}/progreso` | solicitar, aceptar, rechazar, bloquear, ver progreso |
| POST | `/bloquear`, `/reportar` | moderación (3 reportes ocultan el perfil) |
| GET/POST/PUT/DELETE | `/retos`, `/retos/{clave}/unirse`, `/retos/{clave}/avance`, `/retos/{clave}` | retos semanales |
| GET/POST | `/feed`, `/reacciones` | eventos de la app y reacciones de una lista cerrada |
| GET | `/exportar` | todo lo que el servidor tiene de la cuenta |
| DELETE | `/cuenta` | borra la cuenta y todo en cascada |

Toda la API genérica de colecciones está cerrada (reglas `null`); cualquier campo fuera de la lista permitida
responde 400 (nunca se guarda en silencio). Peso, estatura, edad exacta, padecimientos, medicamentos y alergias
no tienen dónde guardarse.

## Pruebas

```bash
node --test tests/reglas.test.mjs                       # reglas puras
PB_URL=http://127.0.0.1:8090 PB_SU_EMAIL=admin@progresium.local \
  PB_SU_PASSWORD="$(cat secretos/admin.txt)" PB_ORIGEN=https://kyostenas.github.io \
  node --test tests/api.test.mjs                        # contra un servidor real
```

# Progressium en una sola imagen: la PWA (Angular) + la API de la comunidad (PocketBase) en el mismo origen.
# Multi-arquitectura (linux/amd64 y linux/arm64). Contexto de build: la raíz del repo.
#   docker build -f server/Dockerfile -t progressium .

# 1) Build de la PWA. Corre en la arquitectura del builder; el resultado (HTML/JS/CSS) sirve para todas.
FROM --platform=$BUILDPLATFORM node:24-alpine AS pwa
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY angular.json tsconfig.json tsconfig.app.json ngsw-config.json ./
COPY public ./public
COPY src ./src
RUN npx ng build --configuration production --base-href / \
 && test -f dist/racha-app/browser/ngsw-worker.js \
 && test -f dist/racha-app/browser/manifest.webmanifest

# 2) Imagen final: PocketBase + migraciones + hooks + la PWA en pb_public.
FROM alpine:3.22
ARG PB_VERSION=0.40.6
ARG PB_SHA256_AMD64=0e1f609158ed945f809f8a02ae012aa0427129c66ebb63c1aee76f2c0309373f
ARG PB_SHA256_ARM64=d22c66ceb67ca92b7d767f36d826e848a276bcfa3c197ead20bf87c42208984f
ARG TARGETARCH
ARG PROGRESSIUM_VERSION=dev

RUN set -eux; \
    apk add --no-cache ca-certificates tzdata sqlite wget unzip; \
    case "${TARGETARCH:-amd64}" in \
      amd64) sum="$PB_SHA256_AMD64" ;; \
      arm64) sum="$PB_SHA256_ARM64" ;; \
      *) echo "arquitectura no soportada: $TARGETARCH"; exit 1 ;; \
    esac; \
    wget -q -O /tmp/pb.zip "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${TARGETARCH:-amd64}.zip"; \
    echo "$sum  /tmp/pb.zip" | sha256sum -c -; \
    mkdir -p /pb/pb_data; unzip -q /tmp/pb.zip pocketbase -d /pb; rm /tmp/pb.zip; \
    apk del unzip; \
    addgroup -S -g 10001 progressium; adduser -S -u 10001 -G progressium -h /pb progressium; \
    chown -R progressium:progressium /pb/pb_data

COPY --chown=root:root server/pb_migrations /pb/pb_migrations
COPY --chown=root:root server/pb_hooks /pb/pb_hooks
COPY --chown=root:root --chmod=0755 server/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
COPY --from=pwa --chown=root:root /app/dist/racha-app/browser /pb/pb_public

ENV PROGRESSIUM_VERSION=${PROGRESSIUM_VERSION} \
    TZ=America/Mexico_City

LABEL org.opencontainers.image.title="progressium" \
      org.opencontainers.image.description="Progressium: PWA + comunidad opcional (PocketBase) en el mismo origen" \
      org.opencontainers.image.source="https://github.com/Kyostenas/racha-app" \
      org.opencontainers.image.licenses="MIT"

USER progressium
WORKDIR /pb
VOLUME /pb/pb_data
EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8090/api/health || exit 1
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["serve"]

# Servidor de la comunidad de Progresium: PocketBase + migraciones + hooks.
# Multi-arquitectura (linux/amd64 y linux/arm64). Se publica en ghcr.io/kyostenas/progresium-server.
FROM alpine:3.22

ARG PB_VERSION=0.40.6
ARG PB_SHA256_AMD64=0e1f609158ed945f809f8a02ae012aa0427129c66ebb63c1aee76f2c0309373f
ARG PB_SHA256_ARM64=d22c66ceb67ca92b7d767f36d826e848a276bcfa3c197ead20bf87c42208984f
ARG TARGETARCH
ARG PROGRESIUM_VERSION=dev

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
    apk del wget unzip; \
    addgroup -S -g 10001 progresium; adduser -S -u 10001 -G progresium -h /pb progresium; \
    chown -R progresium:progresium /pb/pb_data

COPY --chown=root:root pb_migrations /pb/pb_migrations
COPY --chown=root:root pb_hooks /pb/pb_hooks
COPY --chown=root:root --chmod=0755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

ENV PROGRESIUM_VERSION=${PROGRESIUM_VERSION} \
    PROGRESIUM_ORIGINS=https://kyostenas.github.io \
    TZ=America/Mexico_City

LABEL org.opencontainers.image.title="progresium-server" \
      org.opencontainers.image.description="Servidor opcional de la comunidad de Progresium (PocketBase)" \
      org.opencontainers.image.source="https://github.com/Kyostenas/racha-app" \
      org.opencontainers.image.licenses="MIT"

USER progresium
WORKDIR /pb
VOLUME /pb/pb_data
EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8090/api/health || exit 1
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["serve"]

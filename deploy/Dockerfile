# syntax=docker/dockerfile:1
# Сервер VideoNote Taker: Node 22 + yt-dlp + ffmpeg. Сборка из корня репозитория:
#   docker build -f deploy/Dockerfile -t videonote-backend .

ARG NODE_IMAGE=node:22-bookworm-slim
FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY extension/package.json extension/
# Скрипты установки (готовый модуль SQLite) на этапе сборки не нужны — только esbuild
# Секрет extra_ca — только для сборки за корпоративным прокси (на обычном сервере не нужен)
RUN --mount=type=secret,id=extra_ca,required=false \
  NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca npm ci --workspace backend --include-workspace-root=false --ignore-scripts --no-audit --no-fund \
  && npm rebuild esbuild
COPY shared shared
COPY backend backend
RUN npm run build -w backend

FROM ${NODE_IMAGE}
# INSTALL_TOOLS=false — только для проверки сборки там, где нет доступа к репозиториям Debian
ARG INSTALL_TOOLS=true
RUN if [ "$INSTALL_TOOLS" = "true" ]; then \
      apt-get update \
      && apt-get install -y --no-install-recommends ffmpeg python3 python3-pip ca-certificates \
      && pip3 install --break-system-packages --no-cache-dir "yt-dlp[default]" \
      && rm -rf /var/lib/apt/lists/*; \
    fi
WORKDIR /app
COPY backend/package.json ./package.json
RUN --mount=type=secret,id=extra_ca,required=false \
  NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/backend/dist ./dist

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATABASE_PATH=/data/videonote.sqlite \
    TMP_DIR=/tmp/videonote \
    TRUST_PROXY=true \
    ALLOWED_PLATFORMS=rutube,vk_video
RUN mkdir -p /data /tmp/videonote && chown node:node /data /tmp/videonote
VOLUME /data
EXPOSE 3000
USER node
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]

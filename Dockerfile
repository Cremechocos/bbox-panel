# Ma Bbox — relais local (Node, sans dépendance à l'exécution) + interface React construite à la première étape.
# L'interface est faite de fichiers statiques : on la construit une fois, sur l'architecture de la machine de build,
# puis on la copie dans l'image de chaque architecture (amd64, arm64, arm/v7 pour Raspberry Pi).
FROM --platform=$BUILDPLATFORM node:22-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web ./
RUN npx vite build

FROM node:22-alpine
LABEL org.opencontainers.image.source="https://github.com/Cremechocos/bbox-panel" \
      org.opencontainers.image.description="Ma Bbox : panel moderne pour Bbox Bouygues Telecom"
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY --from=web /web/dist ./web/dist
RUN mkdir -p /data && chown node:node /data
ENV NODE_ENV=production PORT=8484 HOST=0.0.0.0 DATA_DIR=/data
VOLUME ["/data"]
EXPOSE 8484
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD wget -qO- http://127.0.0.1:8484/panel/health >/dev/null || exit 1
CMD ["node", "server/index.mjs"]

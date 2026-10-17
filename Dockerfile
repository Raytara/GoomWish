# GoomY perso : image de production (fonctionne sur PC x86 comme sur Raspberry Pi 64 bits).

# ---------- 1. Construction ----------
FROM node:24-bookworm-slim AS build
WORKDIR /app

# Outils de compilation, au cas où better-sqlite3 n'aurait pas de binaire prêt pour l'architecture
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# Le pré-rendu du build se connecte à un serveur local : on force l'IPv4 (l'IPv6 est souvent absent dans un conteneur)
RUN NODE_OPTIONS=--dns-result-order=ipv4first npm run build \
 && npm prune --omit=dev

# ---------- 2. Image finale ----------
FROM node:24-bookworm-slim
WORKDIR /app

# ffmpeg pour extraire l'audio ; curl pour télécharger yt-dlp
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*

# yt-dlp : binaire officiel (la version apt est trop ancienne). TARGETARCH vaut amd64 ou arm64.
ARG TARGETARCH
RUN case "$TARGETARCH" in \
      arm64) YTDLP=yt-dlp_linux_aarch64 ;; \
      amd64) YTDLP=yt-dlp_linux ;; \
      *) echo "Architecture non prise en charge : $TARGETARCH" && exit 1 ;; \
    esac \
 && curl -fsSL "https://github.com/yt-dlp/yt-dlp/releases/latest/download/$YTDLP" -o /usr/local/bin/yt-dlp \
 && chmod a+rx /usr/local/bin/yt-dlp \
 && yt-dlp --version

# YouTube demande un moteur JavaScript à yt-dlp : on lui donne Node, déjà présent dans l'image
RUN echo '--js-runtimes node' > /etc/yt-dlp.conf

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json server.mjs ./

# La base de données vit dans /app/data (volume) ; tmp/ reçoit les audios, supprimés après chaque import.
# Le conteneur peut tourner avec n'importe quel utilisateur (voir « user » dans docker-compose.yml).
RUN mkdir -p data tmp /tmp/.cache && chmod 777 data tmp /tmp/.cache

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DB_PATH=/app/data/recipes.db \
    XDG_CACHE_HOME=/tmp/.cache
VOLUME /app/data
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

USER node
CMD ["node", "server.mjs"]

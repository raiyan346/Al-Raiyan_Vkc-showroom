FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/package.json
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN npm ci --no-audit --no-fund
COPY . .
RUN DB_PROVIDER=postgresql DATABASE_URL=postgresql://build:build@localhost:5432/pos node server/scripts/db-setup.js --generate-only
RUN npm run build
RUN npm prune --omit=dev --no-audit --no-fund
RUN mkdir -p /app/backups && chown -R node:node /app

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build --chown=node:node /app /app
ENV NODE_ENV=production PORT=3001 DB_PROVIDER=postgresql BACKUP_DIR=/app/backups
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s CMD node -e "fetch('http://127.0.0.1:3001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh","-c","npm run db:setup && npm run db:seed && npm start"]

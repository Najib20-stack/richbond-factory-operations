# syntax=docker/dockerfile:1

FROM node:24-alpine AS frontend-build
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:24-alpine AS backend-dependencies
WORKDIR /build/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

FROM node:24-alpine AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATABASE_SSL_MODE=verify-full \
    DATABASE_AUTO_SEED=false

WORKDIR /app
RUN mkdir -p /app/database/migrations /app/frontend/dist \
    && chown -R node:node /app

COPY --chown=node:node backend/ ./backend/
COPY --from=backend-dependencies --chown=node:node /build/backend/node_modules/ ./backend/node_modules/
COPY --chown=node:node database/seed.json ./database/seed.json
COPY --chown=node:node database/migrations/ ./database/migrations/
COPY --from=frontend-build --chown=node:node /build/frontend/dist/ ./frontend/dist/

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "backend/server.mjs"]

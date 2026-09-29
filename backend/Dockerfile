# =============================================================================
# backend/Dockerfile
# Multi-stage build for the CampusCoin API and worker (same image, different CMD — see
# docker-compose.prod.yml). Build context is the repo ROOT (npm workspaces monorepo), so every
# path below is relative to it, e.g. `docker build -f backend/Dockerfile .`.
#
# Stages:
#   deps       – full `npm ci` (all workspace package.json files present, so the lockfile check
#                passes), needed to run the TypeScript/Prisma build tooling below.
#   build      – compiles @campuscoin/shared and @campuscoin/backend to plain JS (dist/); prisma
#                generate runs here too (the generated client is TypeScript under src/generated,
#                compiled into dist/ by the same `tsc` build — see prisma/schema.prisma's
#                generator block, `output: ../src/generated/prisma`).
#   prod-deps  – a SEPARATE `npm ci --omit=dev`, scoped to just @campuscoin/backend (+ root) via
#                `--workspace`, so frontend's react/vite/etc. are never installed here — this is
#                what "runtime chỉ có dist + prod deps" (docs/spec/04 §4.4 Bảng 12) means.
#   runtime    – node:24-alpine, non-root `node` user, only the 3 things above copied in: the
#                compiled dist/ (both packages), the pruned prod node_modules, and each package's
#                own package.json (Node's ESM loader needs backend/package.json's "type":"module"
#                next to dist/server.js; @campuscoin/shared's package.json is the target of the
#                node_modules/@campuscoin/shared workspace symlink). No build tools, no source.
#
# Runs as `api` (2 replicas) and `worker` (command overridden in docker-compose.prod.yml) with the
# SAME image, per Bảng 12 ("worker: cùng image API, lệnh khởi động khác").
# Spec: docs/spec/04 §4.4 (Bảng 12) · docs/spec/09 §9.16 (non-root, no build tools in final image)
# =============================================================================

FROM node:24-alpine AS base
WORKDIR /app

# ---- deps: everything needed to build (incl. devDependencies) -----------------------------
FROM base AS deps
# python3/make/g++: fallback in case argon2/msgpackr-extract have no prebuilt musl (alpine) binary
# and npm falls back to compiling from source (node-gyp) — a no-op extra layer cost if unused.
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
COPY shared/package.json shared/package.json
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
# Root "postinstall" (build:shared + db:generate) would run here too, before any source is
# copied in (tsconfig.json/schema.prisma don't exist yet) — the `build` stage below runs the
# equivalent steps explicitly, in the right order, once the source is actually present.
RUN npm pkg delete scripts.postinstall
RUN npm ci

# ---- build: compile shared + backend to dist/ ----------------------------------------------
FROM deps AS build
COPY tsconfig.base.json ./
COPY shared/ shared/
COPY backend/ backend/
RUN npm run build -w @campuscoin/shared
RUN npm run db:generate -w @campuscoin/backend
RUN npm run build -w @campuscoin/backend

# ---- prod-deps: production dependencies for @campuscoin/backend ONLY ------------------------
FROM base AS prod-deps
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
COPY shared/package.json shared/package.json
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
# The root "postinstall" script (build:shared + db:generate) needs devDependencies (rimraf, tsc)
# this stage deliberately omits — shared/dist and the generated Prisma client are already produced
# by the `build` stage and copied into the runtime image separately, so drop the hook here.
RUN npm pkg delete scripts.postinstall
RUN npm ci --omit=dev --workspace=@campuscoin/backend --include-workspace-root

# ---- runtime: the actual image shipped to production -----------------------------------------
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=prod-deps --chown=node:node /app/package.json ./package.json
COPY --chown=node:node shared/package.json ./shared/package.json
COPY --from=build --chown=node:node /app/shared/dist ./shared/dist
COPY --chown=node:node backend/package.json ./backend/package.json
COPY --from=build --chown=node:node /app/backend/dist ./backend/dist

WORKDIR /app/backend
# Security review finding (P20, Low): pre-create + chown the cleanup.expired job's archive dir
# (AUDIT_ARCHIVE_DIR) as root, before switching to `node` — docker-compose.prod.yml mounts a named
# volume exactly here for the `worker` service, and Docker only copies an image directory's
# existing content (INCLUDING ownership) into a fresh named volume on its first mount; without
# this, the volume would come up root-owned and every archive write would fail with EACCES.
RUN mkdir -p backups/audit && chown -R node:node backups
USER node
EXPOSE 3000

# Only meaningful for the `api` service — docker-compose.prod.yml disables this for `worker`
# (no HTTP server to probe there). API_PORT defaults to 3000 like the app itself (config/env.ts).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider "http://127.0.0.1:${API_PORT:-3000}/api/v1/health/live" || exit 1

CMD ["node", "dist/server.js"]

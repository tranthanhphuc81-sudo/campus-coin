# =============================================================================
# frontend/Dockerfile
# Builds the static SPA and serves it (+ reverse-proxies /api) with Nginx. Build context is the
# repo ROOT: `docker build -f frontend/Dockerfile .`. VITE_* build args are baked into the bundle
# at build time (Vite inlines them — they are NOT secrets, docs/spec/10 §11.3) — pass real values
# via `--build-arg` in CI (.github/workflows/deploy.yml); left empty here they match this app's
# "no third party configured" fallback (same-origin API, no Tawk, no Sentry).
# Spec: docs/spec/04 §4.4 (Bảng 12: nginx non-root) · docs/spec/10 §10.1 (bundle budget)
# =============================================================================

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/package.json
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
# Root "postinstall" (build:shared + db:generate) would run here too, before any source is
# copied in — the `build` stage below builds @campuscoin/shared explicitly once it is present.
RUN npm pkg delete scripts.postinstall
RUN npm ci

FROM deps AS build
ARG VITE_API_URL=
ARG VITE_SENTRY_DSN=
ARG VITE_TAWK_PROPERTY_ID=
ARG VITE_TAWK_WIDGET_ID=
ENV VITE_API_URL=$VITE_API_URL \
    VITE_SENTRY_DSN=$VITE_SENTRY_DSN \
    VITE_TAWK_PROPERTY_ID=$VITE_TAWK_PROPERTY_ID \
    VITE_TAWK_WIDGET_ID=$VITE_TAWK_WIDGET_ID
COPY tsconfig.base.json ./
COPY shared/ shared/
COPY frontend/ frontend/
RUN npm run build -w @campuscoin/shared
RUN npm run build -w @campuscoin/frontend

# nginx-unprivileged: non-root by default (Bảng 12 "Chạy non-root"), listens on 8080/8443 instead
# of 80/443 (unprivileged ports) — docker-compose.prod.yml maps the host's 80/443 onto them.
# `stable-alpine` tracks nginx's actual stable line (docs/spec/04 §4.4 Bảng 12's literal
# `nginx:stable-alpine`) rather than a minor version this repo would otherwise have to bump by
# hand as it goes EOL (security review finding, P20, Low — this tag was pinned to 1.27 at first).
FROM nginxinc/nginx-unprivileged:stable-alpine AS runtime
# The base image ships its own stock welcome-page config at this exact path — remove it so it
# can't shadow/duplicate app.conf's own server blocks (found via a real container run: nginx's
# `10-listen-on-ipv6-by-default.sh` entrypoint script logs a (non-fatal) warning trying to patch
# this file on the read-only root filesystem otherwise).
RUN rm -f /etc/nginx/conf.d/default.conf
COPY infra/nginx/nginx.conf /etc/nginx/nginx.conf
COPY infra/nginx/cloudflare-real-ip.conf /etc/nginx/cloudflare-real-ip.conf
COPY infra/nginx/security-headers.conf /etc/nginx/security-headers.conf
COPY infra/nginx/conf.d/ /etc/nginx/conf.d/
COPY infra/nginx/maintenance.html /usr/share/nginx/html-maintenance/maintenance.html
COPY --from=build /app/frontend/dist /usr/share/nginx/html

# The base image already runs as this uid by default — stated explicitly so Trivy's Dockerfile
# config scan (DS002, ci.yml's `trivy` job) can see it too, instead of failing the config-scan
# purely because the instruction itself was implicit (security review finding, P20, Low).
USER 101
EXPOSE 8080 8443

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:8080/healthz || exit 1

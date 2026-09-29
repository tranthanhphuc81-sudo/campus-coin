# Production deployment guide

Step-by-step production setup (docs/spec/10 §11.4.4). Local/staging manual install is covered by
the root `README.md`/`HUONG-DAN.md` and docs/spec/10 §11.4.2–§11.4.3 instead — this file is only
about the real production path: VPS → Docker Compose → Nginx → Cloudflare → GitHub Actions.

## 1. VPS setup (Ubuntu 24.04 LTS)

```bash
# As root, once:
adduser deploy && usermod -aG sudo deploy
# Copy your SSH public key to the new user, then disable root/password login:
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy
# /etc/ssh/sshd_config: PermitRootLogin no, PasswordAuthentication no
systemctl restart ssh

apt update && apt install -y ufw fail2ban unattended-upgrades docker.io docker-compose-plugin age rclone
ufw default deny incoming
ufw allow from <YOUR_ADMIN_IP> to any port 22
ufw enable
dpkg-reconfigure --priority=low unattended-upgrades
usermod -aG docker deploy
```

**Important, and easy to get wrong (security review finding, P20):** `ufw allow 80,443/tcp` does
**not** actually restrict who can reach nginx. Docker manages its own published ports (`ports:` in
docker-compose.prod.yml) by inserting rules straight into iptables' `DOCKER`/`FORWARD` chains,
which UFW's `ufw-user-input` chain never sees — a container's published port stays reachable from
the whole internet regardless of any `ufw deny`/`allow` rule for it. `infra/nginx/cloudflare-real-
ip.conf` only *trusts* the client IP Cloudflare reports for logging/rate-limiting; it does not
block a request that skipped Cloudflare and hit the VPS's IP directly, so without the step below,
Cloudflare's WAF/DDoS protection is just decorative. Restrict the two published ports to
Cloudflare's own edge ranges (<https://www.cloudflare.com/ips/>) in the chain Docker actually
respects instead:

```bash
for ip in $(curl -s https://www.cloudflare.com/ips-v4) $(curl -s https://www.cloudflare.com/ips-v6); do
  iptables -I DOCKER-USER -s "$ip" -p tcp -m multiport --dports 80,443 -j ACCEPT
done
iptables -A DOCKER-USER -p tcp -m multiport --dports 80,443 -j DROP
# Persist across reboots (iptables-persistent), and re-run this whenever Cloudflare's published
# ranges change (rare) — see also Cloudflare's "Authenticated Origin Pulls" for an even stronger
# guarantee (mutual TLS between Cloudflare and nginx, independent of IP spoofing entirely).
apt install -y iptables-persistent && netfilter-persistent save
```

## 2. Domain + Cloudflare

1. Point the domain's A/AAAA record at the VPS IP, proxy (orange cloud) **on**.
2. Cloudflare dashboard → SSL/TLS → **Full (strict)** — Cloudflare↔origin must be a real
   certificate, not "Flexible" (which would mean Cloudflare↔origin is plaintext HTTP).
3. Cloudflare dashboard → SSL/TLS → Edge Certificates → enable "Always Use HTTPS" + HSTS.

## 3. TLS certificate on the origin (Let's Encrypt)

```bash
sudo apt install -y certbot
sudo certbot certonly --webroot -w /opt/campuscoin/infra/nginx/acme \
  -d campuscoin.example.com --email you@example.com --agree-tos
```

`infra/nginx/conf.d/app.conf`'s port-8080 server block serves `/.well-known/acme-challenge/`
from that same webroot for the HTTP-01 challenge. Point `docker-compose.prod.yml`'s
`./infra/certs:/etc/nginx/certs:ro` mount at the real cert instead of the self-signed one:

```bash
sudo ln -sf /etc/letsencrypt/live/campuscoin.example.com/fullchain.pem infra/certs/fullchain.pem
sudo ln -sf /etc/letsencrypt/live/campuscoin.example.com/privkey.pem infra/certs/privkey.pem
```

Renewal: `certbot renew` (add a systemd timer or cron entry) then
`docker compose --env-file .env.production -f docker-compose.prod.yml restart nginx` to pick up
the renewed files (nginx does not hot-reload a changed volume mount on its own).

## 4. Clone the repo + configure secrets

```bash
sudo mkdir -p /opt/campuscoin && sudo chown deploy:deploy /opt/campuscoin
git clone <repo-url> /opt/campuscoin && cd /opt/campuscoin
cp .env.production.example .env.production
npm run keys:generate   # paste JWT_PRIVATE_KEY/JWT_PUBLIC_KEY/JWT_KID/DATA_ENCRYPTION_KEY/IP_HASH_SECRET
age-keygen -o /root/campuscoin-backup-age-key.txt   # keep this file OFFLINE — copy it off the VPS
                                                     # immediately, then paste its "public key:"
                                                     # line into .env.production's
                                                     # BACKUP_AGE_RECIPIENT and delete it from the VPS.
$EDITOR .env.production   # fill in real MySQL/Redis passwords, SMTP, AI key, Sentry DSN, etc.
```

`.env.production` (and the age private key) are never committed — see `.gitignore`.

## 5. GitHub Actions secrets/variables (Settings → Secrets and variables → Actions)

| Name | Used by | Notes |
|---|---|---|
| `STAGING_SSH_HOST` / `STAGING_SSH_USER` / `STAGING_SSH_KEY` | `deploy.yml` (staging) | A deploy-only SSH key, `authorized_keys`-restricted if possible |
| `PROD_SSH_HOST` / `PROD_SSH_USER` / `PROD_SSH_KEY` | `deploy.yml` (production) | Same, for the production host |
| `STAGING_DEPLOY_PATH` / `PROD_DEPLOY_PATH` | `deploy.yml` | e.g. `/opt/campuscoin` |
| `VITE_API_URL`, `VITE_SENTRY_DSN`, `VITE_TAWK_PROPERTY_ID`, `VITE_TAWK_WIDGET_ID` (repo **variables**, not secrets — baked into the public bundle) | `deploy.yml`'s image build | Leave empty for "same-origin API, no Tawk, no Sentry" |

`GITHUB_TOKEN` (pushing to GHCR, reading in `docker login`) is automatic — no setup needed. Then,
**Settings → Environments**: create a `production` environment and add yourself (or the team) as a
**required reviewer** — this is what makes `deploy.yml`'s `deploy-production` job pause for manual
approval; nothing in the workflow file itself can configure that gate.

## 6. First deploy

```bash
cd /opt/campuscoin
npm run docker:prod:up        # or: docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
npm run docker:prod:migrate   # prisma migrate deploy (one-off "migrate" service)
```

Every subsequent deploy happens automatically via `.github/workflows/deploy.yml` on a merge to
`main` (after CI is green, staging deploys, then production waits for the approval from step 5).

## 7. Create the real admin account

```bash
# The runtime image ships only compiled dist/ + prod deps (no tsx/devDependencies, see
# backend/Dockerfile) — run the compiled script directly, not `npm run admin:create` (that script
# is a dev-only tsx wrapper around the same file). ADMIN_EMAIL/ADMIN_PASSWORD are passed with `-e`
# for this ONE command only (security review finding, P20) — they are deliberately not part of
# api-1/api-2/worker's normal environment (docker-compose.prod.yml's `app-env` anchor), so an
# unrelated bug/RCE in the long-running API process can't read a credential it never needed.
docker compose --env-file .env.production -f docker-compose.prod.yml exec \
  -e ADMIN_EMAIL=admin@yourdomain.com -e ADMIN_PASSWORD='a-strong-password' \
  api node dist/scripts/create-admin.js
```

Follow the printed TOTP QR-enrolment steps at `https://<domain>/admin/login` on first sign-in. Do
**not** use the demo seed (`--demo`, docs/spec/10 §11.5) in production — it is local/staging only.

## 8. Backups, monitoring, maintenance mode

```bash
crontab -e
# 0 2 * * *     /opt/campuscoin/infra/backup/backup.sh       >> /var/log/campuscoin-backup.log 2>&1
# */15 * * * *  /opt/campuscoin/infra/backup/binlog-sync.sh  >> /var/log/campuscoin-backup.log 2>&1
```

- **UptimeRobot**: monitor `https://<domain>/api/v1/health/live` (1-minute interval, docs/spec/10
  §10.5) and alert by email/Telegram on a failure.
- **Sentry**: set `SENTRY_DSN`/`SENTRY_ENV` (backend) and the `VITE_SENTRY_DSN` repo variable
  (frontend build arg) — both are no-ops until set (`backend/src/lib/sentry.ts`,
  `frontend/src/lib/sentry.ts`).
- **Restore drill**: once a month, run `infra/backup/restore.sh` against **staging** (never
  production) with the offline age key, then smoke-test staging. Log the date/result somewhere
  durable (a simple line in this file's own git history, or a ticket, is enough).
- **Maintenance mode**: `touch infra/nginx/maintenance-control/maintenance.flag` takes the site
  down with a static "back shortly" page (no restart needed — nginx checks the file on every
  request); `rm` it to restore service.

## 9. Rollback

Every image is tagged with the git SHA it was built from (`ghcr.io/<repo>-api:<sha>`,
`...-web:<sha>`) and GHCR keeps every tag pushed. To roll back to a known-good commit:

```bash
cd /opt/campuscoin
export IMAGE_TAG=<previous-good-sha>
docker compose --env-file .env.production -f docker-compose.prod.yml up -d
```

A rollback does **not** revert a database migration by itself — check whether the bad deploy's
migration is backward-compatible with the older code before rolling back the images; if not,
restore from the most recent backup instead (`infra/backup/restore.sh`) per the incident-response
process (docs/spec/09 §9.15).

## 10. Local Windows test run of this exact compose file

Useful before ever touching a real VPS — proves the images/compose file work at all, using a
throwaway self-signed cert:

```bash
npm run certs:dev
npm run docker:prod:up
npm run docker:prod:migrate
```

Open `https://localhost` (click through the self-signed-certificate warning — expected, this is
not the real Let's Encrypt cert). `docker compose --env-file .env.production -f docker-compose.prod.yml ps`
should show `nginx`, `api-1`, `api-2`, `worker`, `mysql`, `redis` all healthy.
`npm run docker:prod:down` tears it down again.

## Known limitations (see PROGRESS.md for the full list)

- Brotli compression is not enabled (`infra/nginx/nginx.conf` uses gzip only — the stock
  `nginx:*-alpine`/`nginxinc/nginx-unprivileged` images don't ship `ngx_brotli`; a custom nginx
  build was judged out of scope for this phase).
- The frontend's initial JS bundle is ~218 KB gzip, slightly over the 200 KB budget — see
  `docs/perf.md` §3 for the measured breakdown, root cause, and the recommended follow-up fix.

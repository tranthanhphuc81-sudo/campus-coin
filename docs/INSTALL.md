# CampusCoin Installation Guide

This guide covers setting up CampusCoin for development, testing, or production deployment.
For a quick start, see the root `README.md`. For detailed design rationale, see `docs/spec/10-performance-deployment.md`.

## System Requirements

- **Operating system:** Windows 10/11, macOS, or Linux
- **Node.js:** 24 LTS or newer
- **npm:** 11 or newer
- **Git:** Latest stable version
- **Docker:** Docker Desktop (Windows/macOS) or Docker Engine + Compose v2 (Linux)
- **Optional (if not using Docker):** MySQL 8.4, Redis 7 installed locally
- **Browser:** Chrome, Edge, Firefox, or Safari (latest versions)

## Quick Start (Docker – Recommended)

This is the fastest way to get the app running. All services (MySQL, Redis, email sandbox) are containerized.

### Step 1: Clone and configure

**PowerShell:**
```powershell
# Clone the repository
git clone https://github.com/YOUR_REPO.git CampusCoin
cd CampusCoin

# Copy the example environment file
Copy-Item .env.example .env

# Generate JWT keys and encryption secrets
npm run keys:generate
```

**Bash (macOS/Linux):**
```bash
git clone https://github.com/YOUR_REPO.git CampusCoin
cd CampusCoin
cp .env.example .env
npm run keys:generate
```

Copy the output from `npm run keys:generate` and paste the values into the corresponding lines in `.env`:
- `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`, `JWT_KID`
- `IP_HASH_SECRET`
- `DATA_ENCRYPTION_KEY`

### Step 2: Install dependencies

**PowerShell:**
```powershell
npm install
```

**Bash:**
```bash
npm install
```

### Step 3: Start Docker services

**PowerShell:**
```powershell
# Start MySQL, Redis, and Mailpit
docker compose up -d

# Wait until all containers are healthy (check status below)
docker compose ps
```

**Bash:**
```bash
docker compose up -d
docker compose ps
```

All three containers should show `(healthy)` in the `STATUS` column. If MySQL takes longer on first run, wait 10–15 seconds and run `docker compose ps` again.

### Step 4: Initialize the database

**PowerShell:**
```powershell
npm run db:migrate -w backend
npm run db:seed -w backend -- --demo
```

**Bash:**
```bash
npm run db:migrate -w backend
npm run db:seed -w backend -- --demo
```

The seed script prints the admin TOTP code to the console (used for MFA login).

### Step 5: Start the development server

**PowerShell:**
```powershell
npm run dev
```

**Bash:**
```bash
npm run dev
```

This starts the API (port 3000), web app (port 5174), and shared package watcher in parallel.

### Step 6: Verify it works

Open your browser:
- **Web app:** http://localhost:5174
- **API health check:** `curl http://localhost:3000/api/v1/health/live`
- **API Swagger docs:** http://localhost:3000/api/v1/docs
- **Email inbox (Mailpit):** http://localhost:8025

Log in with one of the demo accounts listed in `README.md`.

## Manual Installation (No Docker)

Use this path if Docker is not available or you prefer a local database setup.

### Step 1: Install and start MySQL 8.4 and Redis 7

**Windows (with Chocolatey):**
```powershell
choco install mysql redis-64
# Start services
net start MySQL80
net start Redis
```

**macOS (with Homebrew):**
```bash
brew install mysql redis
brew services start mysql
brew services start redis
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt update
sudo apt install -y mysql-server-8.0 redis-server
sudo systemctl start mysql
sudo systemctl start redis-server
```

### Step 2: Set up the database and users

**Option A: Run the initialization script**

Load `database/create_users.sql` into MySQL to create the database and least-privilege user accounts:

**PowerShell:**
```powershell
# From the repo root; adjust the path to mysql if not on PATH
mysql -u root -p < database/create_users.sql
```

**Bash:**
```bash
mysql -u root -p < database/create_users.sql
```

When prompted, enter your MySQL root password.

**Option B: Load the complete schema and seed data**

Alternatively, load the exported schema and seed data directly (faster for testing):

**PowerShell:**
```powershell
mysql -u root -p < database/campus_coin_schema.sql
mysql -u root -p < database/seed.sql
```

**Bash:**
```bash
mysql -u root -p < database/campus_coin_schema.sql
mysql -u root -p < database/seed.sql
```

### Step 3: Configure environment

Copy `.env.example` to `.env` and update:
- `MYSQL_HOST_PORT`, `DATABASE_URL`, `DATABASE_MIGRATOR_URL` (if using a non-default MySQL port)
- `REDIS_URL` (if using a non-default Redis port)
- JWT/encryption keys (run `npm run keys:generate` and paste values)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` (for email; use Mailpit details if running Docker Compose just for email)

### Step 4: Install dependencies and build shared package

**PowerShell:**
```powershell
npm install
```

**Bash:**
```bash
npm install
```

### Step 5: Run migrations and seed

**PowerShell:**
```powershell
npm run db:migrate -w backend
npm run db:seed -w backend -- --demo
```

**Bash:**
```bash
npm run db:migrate -w backend
npm run db:seed -w backend -- --demo
```

### Step 6: Start the servers

Open two terminal windows or use a terminal multiplexer (screen, tmux).

**Terminal 1 – API and worker:**
```powershell
npm run dev -w backend
# or in separate windows:
npm run dev -w backend       # API
npm run worker -w backend    # Background jobs
```

**Terminal 2 – Web app:**
```powershell
npm run dev -w frontend
```

**Bash equivalent:**
```bash
npm run dev -w backend &
npm run worker -w backend &
npm run dev -w frontend
```

### Step 7: Verify it works

- **Web app:** http://localhost:5174
- **API health:** `curl http://localhost:3000/api/v1/health/live`
- **API docs:** http://localhost:3000/api/v1/docs

## Production Deployment

CampusCoin is designed for production on Ubuntu 24.04 LTS with Docker Compose, Nginx, Cloudflare, and GitHub Actions.

For the complete step-by-step guide, see **`docs/deploy.md`**. High-level overview:

1. **VPS setup:** Provision Ubuntu 24.04 LTS, create a deploy user, harden SSH, install Docker/Docker Compose, UFW firewall, and fail2ban.

2. **Domain & Cloudflare:** Point your domain's A/AAAA records to the VPS IP, enable Cloudflare proxy, and set SSL/TLS to "Full (strict)".

3. **CI/CD with GitHub Actions:** Configure secrets (`DATABASE_URL`, `JWT_PRIVATE_KEY`, API keys, etc.) in GitHub, then merge to `main` to auto-build, scan, and deploy via `docker-compose.prod.yml`.

4. **Backups & monitoring:** Enable automated MySQL backups, set up Sentry error tracking, configure UptimeRobot health checks, and test restore procedures.

See **`docs/deploy.md`** for detailed commands and security considerations (e.g., Cloudflare IP allowlisting, Let's Encrypt setup, log rotation).

## Useful Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start API + web in watch mode |
| `npm run worker -w backend` | Start background job processor |
| `npm run lint` / `npm run lint:fix` | Lint and auto-fix |
| `npm run typecheck` | TypeScript strict check |
| `npm test` | Run unit and integration tests |
| `npm run test:e2e` | End-to-end tests (Playwright) |
| `npm run keys:generate` | Print JWT key pair and encryption secrets |
| `npm run db:migrate -w backend` | Run pending database migrations |
| `npm run db:seed -w backend -- --demo` | Populate demo data (dev only) |
| `npm run db:export -w backend` | Export current DB to `database/*.sql` |
| `npm run docs:openapi -w backend` | Regenerate `docs/openapi.yaml` |
| `npm run build` | Production build of all packages |
| `docker compose ps` | Show container status |
| `docker compose down` | Stop all containers |
| `docker compose down -v` | Stop and delete all data (reset) |

## Troubleshooting

### Port already in use

If MySQL, Redis, or the API/web port is already in use, edit `.env`:

| What | Variable to change | Also update |
|------|-------------------|-------------|
| MySQL (3306) | `MYSQL_HOST_PORT` | `DATABASE_URL`, `DATABASE_MIGRATOR_URL` |
| Redis (6379) | `REDIS_HOST_PORT` | `REDIS_URL` |
| API (3000) | `API_PORT` | `API_URL`, `CORS_ORIGINS` |
| Web (5174) | `WEB_PORT` | `APP_URL`, `CORS_ORIGINS` |

Or override without editing (PowerShell):
```powershell
$env:WEB_PORT = 5175; npm run dev
```

### Bash: `npm: command not found`

Ensure Node.js 24 LTS is installed:
```bash
node --version  # Should be v24.x.x or higher
npm --version   # Should be 11.x.x or higher
```

### Docker: Container exits or stays unhealthy

**PowerShell:**
```powershell
docker compose logs mysql
docker compose logs redis
docker compose logs mailpit
```

**Bash:**
```bash
docker compose logs mysql
docker compose logs redis
docker compose logs mailpit
```

To fully reset (deletes local data):
```powershell
docker compose down -v
docker compose up -d
```

### Database migration fails

Ensure the migration account can connect:
```powershell
# Check connection
curl http://localhost:3000/api/v1/health/live
# Review logs
docker compose logs api
```

If using manual MySQL, verify the `cc_migrator` user exists and has the right password in `.env`.

## Next Steps

- Read the **`README.md`** for demo account credentials and security highlights
- Explore the **API Swagger docs** at http://localhost:3000/api/v1/docs
- Check **`docs/spec/`** for design rationale and architecture
- See **`PROGRESS.md`** for current development status and known issues

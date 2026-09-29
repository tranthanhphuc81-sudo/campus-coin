# Changelog

All notable changes to CampusCoin are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [p20-done] - 2026-09-29 — Production: Docker, Nginx, CI/CD, backup, performance

### Added
- Production Docker images for backend and frontend with multi-stage builds and non-root user execution
- Docker Compose production configuration with nginx reverse proxy, dual API instances, dedicated worker, MySQL, and Redis
- GitHub Actions workflows for CI/CD pipeline (`ci.yml`, `deploy.yml`) with automated testing and deployment
- Production nginx configuration with security headers (CSP, HSTS, X-Frame-Options), HTTP→HTTPS redirect, and unbuffered SSE proxy
- Backup and restore scripts (`backup.sh`, `restore.sh`, `binlog-sync.sh`)
- Performance documentation and k6 load-test scripts
- Health check endpoints for dependency readiness (`/api/v1/health/ready`)
- Dependabot configuration for automated dependency updates
- Sentry monitoring integration (lazy-loaded to avoid test timeouts)

### Fixed
- Lazy-load `@sentry/node` to prevent OpenTelemetry instrumentation side effects blocking integration tests
- Corrected nginx `add_header` inheritance for security headers on all HTML responses
- Hardened Sentry SDK defaults to exclude full request bodies and cookies from error payloads
- Patched `workflow_run` fork-bypass vulnerability in CI/CD pipeline

## [p19-done] - 2026-09-29 — Security review & fixes

### Fixed
- Resolved 1 High, 13 Medium, and 26 Low severity findings from comprehensive security review
- Fixed auth/admin endpoint vulnerabilities (High: timing attack on MFA code validation)
- Corrected user-data isolation issues (access-control bypasses on sensitive operations)
- Hardened AI/email/config/frontend security (output validation, XSS prevention, secrets handling)
- Fixed IP-based rate limits that would log out students sharing a campus NAT
- Eliminated all High and Critical vulnerabilities; deferred 9 Low issues with tracking
- Updated dependencies to resolve 5 High and 1 Medium npm vulnerabilities

### Added
- Comprehensive security review documentation (`docs/security/review-p19.md`)
- Additional regression test coverage for security fixes
- Expanded authentication/admin RBAC test suite

## [p18-done] - 2026-09-28 — Test hardening: cross-tenant, E2E, accessibility

### Added
- Dynamic cross-tenant security sweep test (`cross-tenant-sweep.test.ts`) validating 404s on all 25 student data routes
- End-to-end test suite with Playwright (chromium full, firefox/webkit cross-browser subset, mobile 375px)
- 15 numbered E2E scenario specifications covering core user journeys
- Accessibility testing expanded to 7 pages × light/dark modes (0 serious/critical issues)
- Test coverage documentation (`docs/testing/tc-matrix.md`) mapping all TC-01..28 to real tests
- Page Object Model (POM) layer for E2E tests with shared helpers and per-worker login fixtures
- Automated demo data re-seeding for each E2E test run

### Fixed
- Dark mode contrast issue on `.btn-outline-secondary`
- Duplicate SSE notifications in UI
- Prisma seed script hanging on `--demo` invocation (missing `importBatch` cleanup in data wipe)
- ImportWizard E2E page preview-wait regex timeout
- Confirmed complete `/admin/*` RBAC coverage with 401/403 validation

### Tests
- Backend: 885 of 888 tests passing (3 pre-existing documented flakes)
- Frontend: 105 of 105 tests passing
- Coverage thresholds ≥80% on core modules and utilities

## [p17-done] - 2026-09-28 — Demo accounts & test datasets

### Added
- Demo account seeding feature (`--demo` flag) with five pre-populated test accounts
- Dedicated `demo-seed.test.ts` with 6 new test cases
- Mock transaction and budget data for demonstration and testing
- Admin MFA TOTP setup and enrollment on first demo login
- Demo account credentials provided at startup for quick testing

## [p16-done] - 2026-09-28 — Privacy, data lifecycle, cleanup, chatbot

### Added
- Full data export (JSON and CSV) for user privacy compliance
- Account deletion with confirmation phrase gating and soft-delete mechanics
- Background cleanup job for purging soft-deleted user data after 30-day retention
- Audit trail logging for all sensitive operations
- Tawk.to chatbot integration on public and student-facing pages (excluded from admin)
- Privacy policy and help documentation pages
- Comprehensive audit log filtering and review for administrators

### Fixed
- Resolved 5 Medium and high-value Low security review findings
- Improved email confirmation workflow for account deletion

## [p15-done] - 2026-09-28 — Admin portal

### Added
- Complete admin dashboard with user management (search, enable/disable)
- Category management with archival fallback for in-use categories
- Tip template CRUD and preview functionality
- Announcement creation and management with public feed propagation
- Audit log viewing with filtering by action, user, and timestamp
- Admin statistics and analytics dashboards
- Admin-only pages and routes with full RBAC enforcement

### Fixed
- Email masking utility for privacy-safe display in admin views
- Security review findings related to admin endpoints and data exposure
- Corrected role-based access control for sensitive operations

## [p14-done] - 2026-09-28 — Advanced UX: recent, forecast, anomaly, duplicate, bookmarks

### Added
- Recent activity view with transaction/recurring rule edit history
- Next-month forecast based on recurring rules and historical patterns
- Anomaly detection (unusual spending spike flag with Keep option)
- Duplicate transaction detection and resolution workflow
- Bookmark and save functionality for transactions, reports, and insights
- Saved items page with pin/dismiss management

### Fixed
- Improved anomaly detection accuracy against historical averages
- Enhanced duplicate detection to account for same-day similar amounts

## [p13-done] - 2026-09-28 — Monthly AI insights and savings tips engine

### Added
- Monthly AI insights with growth flags and period-over-period analysis
- Personalized saving tips based on spending patterns and budget goals
- Tip ranking by relevance and user engagement
- Tips engine with comparison to peer averages and budget thresholds
- Dashboard tip widgets showing top 3 personalized recommendations
- Insights and tips history page with dismiss/pin management
- BullMQ background job for scheduled monthly insight and tip generation

### Fixed
- Prevented bare colons in BullMQ job IDs that could cause parsing issues
- Improved AI error handling with rule/keyword template fallback

## [p12-done] - 2026-09-28 — Reports, PDF/PNG export, email share

### Added
- Six-month category spending report with pie/bar chart visualizations
- Income vs. expense comparison report with monthly granularity
- Daily and weekly expense breakdown views
- Report filtering by category, date range, and transaction type
- PDF export of reports with pdfmake library
- PNG export of charts with browser rendering
- Email share workflow for exporting reports to user inbox
- Mailpit integration for dev environment email testing

## [p11-done] - 2026-09-27 — CSV import wizard

### Added
- Multi-step CSV import wizard with file upload and format validation
- Preview step with inline editing of mapped transactions
- Duplicate transaction detection and deduplication during import
- Filter preview (show/hide specific rows) before final commit
- Batch import with transaction creation and rollback on errors
- CSV parsing with configurable date/amount formats
- Transaction history preservation during import
- Redis-cached import preview state

## [p10-done] - 2026-09-27 — AI adapter & 3-tier categorization

### Added
- Provider-agnostic AI adapter supporting Google Gemini Flash and OpenAI
- Three-tier transaction categorization: AI-suggested → ML keyword rules → manual fallback
- AI category learning from user edits and corrections
- Batch AI categorization for CSV import preview
- Quality evaluation suite (`npm run ai:eval`) with tier-2/tier-3 accuracy benchmarks
- Graceful degradation when AI API unavailable (keyword/template fallback)
- Validated JSON output only; AI suggestions never bypass validation

### Fixed
- Resolved security review findings (5 High, 2 Medium, 5 Low)

## [p09-done] - 2026-09-27 — Budgets, notifications, dashboard

### Added
- Category-level budgets with monthly limits and progress tracking
- Budget progress bar visualization in transaction and category views
- Server-Sent Events (SSE) real-time notifications for budget alerts and system announcements
- Dashboard summary with greeting, account balance, quick-add card, and spending widgets
- Top-category summary showing current month's top 5 spending categories
- Budget vs. actual comparison widget for visual spending analysis
- In-app notification bell with unread badge
- Notification preferences and dismissal

## [p08-done] - 2026-09-27 — Transactions & categories UI

### Added
- Transaction quick-add form (≤3 taps: category, amount, date)
- Transaction list view with sorting, filtering, and pagination
- Category management interface for personal and system categories
- Transaction trash view with soft-delete and restore actions
- Category color coding and icons for visual organization
- Empty state guidance for new users
- Responsive layouts for mobile and desktop

## [p07-done] - 2026-09-27 — Categories, transactions, history, recurring (backend)

### Added
- Transaction creation, update, and soft-delete/restore with optimistic locking
- Transaction history tracking with version control
- Recurring rule creation and auto-generation of periodic transactions
- Category hierarchy (default system and user-personal)
- Merchant key normalization for spending analysis
- Business rules enforcement (BR-TX-01..08)
- Domain events for transaction lifecycle (created, updated, deleted, restored)
- Comprehensive transaction test suite (269 tests)

## [p06-done] - 2026-09-27 — Public pages, auth UI, onboarding, settings

### Added
- Landing page with feature highlights and call-to-action
- Login page with email/password form and forgot-password link
- Registration page with validation and onboarding flow
- Password reset page with token-based verification
- User onboarding wizard (3 steps: name, year, savings goal)
- Profile and settings page (name, year, subsidy, savings goal, preferences)
- Dark mode toggle with system preference detection
- Font size adjustment for accessibility
- User profile menu with logout action

## [p05-done] - 2026-09-26 — Frontend foundation

### Added
- React 19 with TypeScript strict mode
- Vite build tooling with dev server and HMR
- Bootstrap 5.3 + React-Bootstrap component library with custom SCSS theme
- React Router v7 for SPA routing
- TanStack Query v5 for data fetching and caching
- React Hook Form + Zod for form validation
- Design tokens in `_tokens.scss` (colors, spacing, typography)
- Main layout with responsive navigation
- API client with axios, refresh token queue, and auth header injection
- Error handling and toast notifications

## [p04-done] - 2026-09-26 — Authentication & sessions (student + admin MFA)

### Added
- User registration with email verification
- Password-based login with Argon2id hashing
- JWT authentication (Ed25519 keys, access + refresh tokens)
- Refresh token rotation with HttpOnly cookie storage
- Session management and logout with token revocation
- Admin MFA setup with TOTP and recovery codes
- Admin MFA challenge on login with code verification
- Security headers and rate limiting on auth endpoints
- Password reset workflow via email token

### Tests
- No High or Critical vulnerabilities in security review

## [p03-done] - 2026-09-26 — Backend core infrastructure

### Added
- Express server setup with TypeScript strict mode
- Configuration management via Zod with environment validation
- Request ID middleware for tracing
- Helmet security headers (CSP, X-Frame-Options, etc.)
- CORS configuration for frontend origin
- Request validation middleware with Zod schemas
- Error handling middleware with RFC 9457 problem+json responses
- Pino structured logging with redaction of sensitive fields
- In-process event bus for domain events
- BullMQ job queue for background tasks

## [p02-done] - 2026-09-26 — Database schema, migrations and base seed

### Added
- MySQL 8.4 schema with 18 tables and 10 CHECK constraints
- Prisma ORM setup with `@prisma/adapter-mariadb`
- User, session, and authentication token tables
- Transaction history and recurring rule tables
- Category, budget, and notification tables
- AI rules, tips, bookmarks, and audit log tables
- Idempotent seed with default categories, tip templates, and announcements
- Migration workflow and shadow database setup
- UUID v7 primary keys via Prisma defaults
- Keywords dictionary (577 EN/VI merchant keywords)

## [p01-done] - 2026-09-26 — Monorepo scaffold & dev environment

### Added
- npm workspaces monorepo with `backend/`, `frontend/`, `shared/` packages
- Shared Zod schemas, enums, DTOs, and constants library
- TypeScript strict configuration across all workspaces
- ESLint v9 and Prettier formatters
- Vitest + Supertest for backend unit/integration tests
- Vitest + React Testing Library for frontend unit tests
- Playwright E2E testing framework
- Docker Compose dev environment (MySQL 8.4, Redis 7, Mailpit)
- Dev environment setup with npm scripts (dev, test, lint, format, build)
- Cross-platform npm scripts using `cross-env`, `rimraf`, `concurrently`
- Single `.env` file for all services with configurable ports (API_PORT, WEB_PORT)
- GitHub Actions CI runner

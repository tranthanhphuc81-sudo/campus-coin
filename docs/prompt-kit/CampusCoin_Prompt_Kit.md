# CAMPUS COIN – BỘ PROMPT KIT TRIỂN KHAI DỰ ÁN

**Căn cứ:** Tài liệu thiết kế kỹ thuật Campus Coin v1.0 (bản đã sửa), SRS Techwiz 7 – End-to-End Web Solutions
**Stack:** React 19 + TypeScript + Vite + Bootstrap 5.3 · Node.js 24 + Express 5 + TypeScript · Prisma + MySQL 8.4 · node-cron · Docker Compose + Nginx
**Ngôn ngữ ứng dụng:** toàn bộ bằng tiếng Anh (giao diện, email, PDF, nội dung AI, dữ liệu demo); prompt viết bằng tiếng Việt để đội dễ đọc.
**Phạm vi:** 18 giai đoạn, từ khởi tạo repo tới gói nộp bài (video, README, file SQL, khai báo AI)

---

## 0. CÁCH DÙNG BỘ KIT

### 0.1 Ký hiệu cấp AI

| Ký hiệu | Cấp | Dùng cho | Ví dụ công cụ |
|---|---|---|---|
| 🟢 | Rẻ / nhanh | Boilerplate, file cấu hình, seed, test lặp lại, chuỗi giao diện, CSS | Claude Haiku, Gemini Flash, GPT mini |
| 🔵 | Tầm trung, chạy agentic | Tác vụ nhiều file: một module backend trọn vẹn, một trang frontend kèm hook và API | Claude Sonnet trong Claude Code / Cursor agent |
| 🔴 | Cao cấp, suy luận sâu | Quyết định kiến trúc, bảo mật, thuật toán, thiết kế schema, rà soát cuối | Claude Opus / mô hình reasoning cao nhất bạn có |

Các prompt rủi ro cao được tách thành **hai bước**:

- **Bước A 🔴 – Quyết định:** AI phân tích phương án và chốt thiết kế. **Không viết code.** Bạn đọc, sửa, rồi lưu kết quả vào `docs/decisions/ADR-xx.md`.
- **Bước B 🟢/🔵 – Viết code:** dán kết quả bước A làm đầu vào, AI hiện thực đúng quyết định đó.

Làm theo cách này vì mô hình rẻ viết code nhanh nhưng hay chọn sai kiến trúc. Để mô hình mạnh quyết định một lần rồi mô hình rẻ thi công sẽ vừa rẻ vừa ít phải sửa.

### 0.2 Quy trình cho mỗi prompt

1. Mở phiên mới, dán **Khối ngữ cảnh chung** (mục 0.4) hoặc để công cụ agentic tự đọc file `CLAUDE.md` / `AGENTS.md` (tạo ở Giai đoạn 0).
2. Đính kèm đúng các mục tài liệu thiết kế mà prompt yêu cầu, ví dụ `[Đính kèm: mục 6.3.4]`. Chỉ đính kèm mục cần thiết để AI không bị loãng ngữ cảnh.
3. Chạy prompt, rồi **đọc và chạy thử code**. Không commit code bạn chưa hiểu.
4. Chạy prompt **R-2 (Giải thích để bảo vệ)** ở Phụ lục R cho mọi phần quan trọng. Giám khảo sẽ hỏi.
5. Ghi một dòng vào `docs/ai-usage-log.md` (mẫu ở Giai đoạn 0). SRS bắt buộc khai báo công cụ AI và cấm nộp code AI sinh ra mà không chỉnh sửa hay hiểu.

### 0.3 Nguyên tắc chống "AI viết hộ"

SRS cho phép dùng AI làm trợ lý nhưng yêu cầu sản phẩm thể hiện kỹ năng của đội. Bộ kit này được thiết kế để:

- Đội **tự quyết định** ở các bước 🔴 (AI chỉ đưa phương án và lập luận).
- Mọi prompt code đều yêu cầu AI **giải thích lựa chọn** và **liệt kê chỗ cần đội tự kiểm tra**.
- Có prompt rà soát và giải thích riêng (Phụ lục R) để đội hiểu và sửa được mọi dòng code.

### 0.4 Khối ngữ cảnh chung (dán đầu mỗi phiên nếu công cụ không tự đọc CLAUDE.md)

```text
Bạn là kỹ sư fullstack senior, đang cùng đội mình xây dựng "Campus Coin" – ứng dụng web quản lý thu chi cho sinh viên (cuộc thi Techwiz 7, SRS của Aptech).

STACK CỐ ĐỊNH (không đổi, không thêm framework lớn khi chưa hỏi):
- Frontend: React 19 + TypeScript + Vite, Bootstrap 5.3 + React-Bootstrap + SCSS, React Router v7, TanStack Query v5, React Hook Form + Zod, Chart.js 4 + react-chartjs-2, axios, html-to-image.
- Backend: Node.js 24 LTS + TypeScript, Express 5, Prisma ORM, Zod, helmet, cors, express-rate-limit (bộ nhớ trong), argon2, jose (JWT), node-cron, csv-parse, pdfmake, Nodemailer, pino.
- Database: MySQL 8.4 (InnoDB, utf8mb4). Tiền là DECIMAL(14,2), KHÔNG dùng float. Khóa chính dữ liệu người dùng là UUID v7 dạng CHAR(36).
- Hạ tầng: Docker Compose 3 container (web = Nginx phục vụ SPA + reverse proxy /api, api = Express + node-cron, mysql). KHÔNG dùng Redis, BullMQ, SSE, WebSocket, MFA.

CẤU TRÚC REPO (monorepo):
/api       backend (src/config, src/middlewares, src/modules/<tên>/{routes,controller,service,repository,schema,types}.ts, src/events, src/jobs, src/integrations, src/lib, prisma/, tests/)
/web       frontend (src/app, src/layouts, src/pages, src/features/<tên>, src/components, src/lib, src/styles, src/content)
/packages/shared   schema Zod và type dùng chung FE/BE
/database  campus_coin_schema.sql, seed.sql (xuất ra để nộp)
/docs      decisions/ (ADR), ai-usage-log.md

QUY ƯỚC BẮT BUỘC:
- API: base /api/v1, JSON camelCase, ngày "YYYY-MM-DD", thời điểm ISO 8601 UTC, số tiền trả về dạng CHUỖI "12.50".
- Lỗi: RFC 9457 Problem Details (application/problem+json) gồm type, title, status, detail, instance, requestId, errors[].
- Mọi truy vấn dữ liệu người dùng BẮT BUỘC lọc theo userId lấy từ token. Tài nguyên của người khác trả 404, không phải 403.
- Controller mỏng; nghiệp vụ ở service; truy cập DB ở repository. Module không gọi repository của module khác.
- Validate mọi input bằng Zod tại biên API. Không tin dữ liệu từ client (role, status, userId).
- NGÔN NGỮ: toàn bộ ứng dụng bằng TIẾNG ANH – giao diện, thông báo lỗi (title/detail của Problem Details), email, PDF, mẫu mẹo, nhận định AI, thông báo trong ứng dụng, dữ liệu seed/demo, README. Chỉ một ngôn ngữ, không có bộ chuyển ngôn ngữ. Chuỗi giao diện tập trung trong web/src/content/en.ts (không viết cứng rải rác trong component). Giọng văn: thân thiện, ngắn gọn, tiếng Anh Mỹ (American English), phù hợp sinh viên.
- Dữ liệu người dùng nhập (tên, mô tả) có thể có dấu tiếng Việt: phải lưu, hiển thị, tìm kiếm và xuất PDF đúng (utf8mb4, font có glyph tiếng Việt).
- Code, tên biến, comment, commit message bằng tiếng Anh.
- TypeScript strict. Không dùng any nếu không giải thích.

CÁCH TRẢ LỜI:
- Trước khi viết code: nêu ngắn gọn kế hoạch và các file sẽ tạo/sửa.
- Sau khi viết code: liệt kê (1) giả định bạn đã đặt, (2) chỗ đội cần tự kiểm tra, (3) lệnh để chạy/kiểm thử.
- Nếu yêu cầu mâu thuẫn với tài liệu thiết kế hoặc có rủi ro bảo mật, DỪNG và hỏi lại.
```

---

## GIAI ĐOẠN 0 – NỀN MÓNG LÀM VIỆC VỚI AI

### P0.1 – Tạo file quy tắc dự án (CLAUDE.md / AGENTS.md)

> 🟢 **Rẻ/nhanh** – Chỉ là chuyển Khối ngữ cảnh chung thành file markdown có cấu trúc; không cần suy luận.

```text
[Dán Khối ngữ cảnh chung]

Hãy tạo file CLAUDE.md (và bản sao AGENTS.md cùng nội dung) ở thư mục gốc repo, gồm các mục:
1. Tổng quan dự án (3–4 câu).
2. Stack cố định và những thứ KHÔNG được dùng.
3. Cấu trúc thư mục kèm vai trò từng thư mục.
4. Quy ước code (đặt tên, xử lý lỗi, validate, lọc userId, tiền tệ, ngày giờ).
5. Lệnh thường dùng: cài đặt, chạy dev, migrate, seed, test, lint, build (để placeholder nếu chưa có script).
6. Checklist "Definition of Done" cho mỗi tính năng: có validate Zod, có kiểm tra quyền sở hữu, có test thành công + test bị từ chối, không lỗi lint/type, chuỗi giao diện tiếng Anh nằm trong src/content/en.ts.
Viết ngắn gọn, dạng gạch đầu dòng, tối đa 150 dòng.
```

### P0.2 – Tạo nhật ký sử dụng AI

> 🟢 **Rẻ/nhanh** – Tạo mẫu file đơn giản.

```text
Tạo file docs/ai-usage-log.md với:
- Đoạn mở đầu: SRS Techwiz yêu cầu khai báo mọi công cụ AI; AI chỉ là trợ lý; đội hiểu và giải thích được toàn bộ code.
- Bảng có cột: Ngày | Thành viên | Công cụ AI | Mục đích (thiết kế/code/test/debug/tài liệu/UI) | File hoặc tính năng liên quan | Đội đã chỉnh sửa gì | Người review.
- 2 dòng ví dụ điền sẵn để minh họa cách ghi.
- Mục cuối "Tổng hợp để đưa vào tài liệu nộp" (để trống, điền khi hoàn thành dự án).
```

---

## GIAI ĐOẠN 1 – KHỞI TẠO REPO VÀ HẠ TẦNG DEV

### P1.1 – Khởi tạo monorepo

> 🔵 **Tầm trung agentic** – Tạo nhiều file cấu hình liên quan nhau (workspaces, tsconfig, eslint, prettier) cần nhất quán.

```text
[Dán Khối ngữ cảnh chung]

Khởi tạo monorepo npm workspaces với các package: api, web, packages/shared.
Yêu cầu:
- package.json gốc: workspaces, script chung: dev (chạy song song api + web), lint, typecheck, test, format.
- tsconfig.base.json strict (strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes: false), mỗi package kế thừa.
- ESLint flat config (typescript-eslint, eslint-plugin-react-hooks, eslint-plugin-security cho api), Prettier.
- packages/shared: build bằng tsc, export schema Zod và type; cả api và web import được qua "@campus-coin/shared".
- api: Express 5 + TypeScript, chạy dev bằng tsx watch; build ra dist.
- web: Vite + React 19 + TypeScript; alias "@/..." trỏ src.
- .gitignore, .editorconfig, .nvmrc (Node 24), .env.example ở gốc (để trống giá trị, có chú thích từng biến).
Liệt kê lệnh để tôi chạy kiểm tra sau khi tạo xong.
```

### P1.2 – Docker Compose cho môi trường dev

> 🟢 **Rẻ/nhanh** – Cấu hình Compose chuẩn, ít rủi ro.

```text
[Dán Khối ngữ cảnh chung]

Tạo docker-compose.dev.yml cho môi trường phát triển:
- mysql:8.4 với volume dữ liệu, charset utf8mb4 / collation utf8mb4_0900_ai_ci, healthcheck bằng mysqladmin ping, cổng 3306 chỉ bind 127.0.0.1.
- mailpit (axllent/mailpit) để bắt email khi dev: SMTP 1025, UI 8025.
- Không chứa api/web (dev chạy trực tiếp bằng npm run dev).
Thêm vào .env.example các biến: DATABASE_URL, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM.
Viết thêm script npm "db:up" và "db:down" ở package.json gốc.
```

### P1.3 – Nạp và kiểm tra biến môi trường (fail fast)

> 🟢 **Rẻ/nhanh** – Mẫu quen thuộc: parse process.env bằng Zod.

```text
[Dán Khối ngữ cảnh chung]
[Đính kèm: mục 11.3 Cấu hình môi trường]

Tạo api/src/config/env.ts:
- Dùng Zod parse process.env (dotenv khi dev). Thiếu biến bắt buộc → in danh sách biến lỗi và process.exit(1).
- Nhóm biến: APP (NODE_ENV, PORT, APP_URL, CORS_ORIGINS dạng danh sách phân tách dấu phẩy), DATABASE_URL, JWT (JWT_PRIVATE_KEY, JWT_PUBLIC_KEY dạng PEM, JWT_KID, ACCESS_TOKEN_TTL mặc định 900 giây, REFRESH_TOKEN_TTL mặc định 30 ngày), IP_HASH_SECRET, SMTP_*, MAIL_FROM, AI_PROVIDER (gemini|openai|none), AI_API_KEY (tùy chọn), AI_MODEL, AI_TIMEOUT_MS mặc định 3000, AI_DAILY_QUOTA mặc định 200, SENTRY_DSN (tùy chọn).
- Export object config đã được type.
- Thêm script "keys:generate" sinh cặp khóa EdDSA (Ed25519) bằng jose, in ra dạng PEM để dán vào .env.
```

### P1.4 – Khung Express, middleware pipeline, lỗi chuẩn RFC 9457

> 🔵 **Tầm trung agentic** – Nhiều file phụ thuộc thứ tự (app, middleware, error handler, logger) và là xương sống cho mọi module sau.

```text
[Dán Khối ngữ cảnh chung]
[Đính kèm: mục 4.2 Kiến trúc Backend, 7.1 Quy ước API, 7.2 Định dạng lỗi chuẩn, 9.11 Header bảo mật]

Tạo khung backend:
1. api/src/app.ts: tạo Express app, gắn middleware theo THỨ TỰ: requestId (sinh UUID, đặt header X-Request-Id) → pino-http (redact: password, token, authorization, cookie) → helmet (CSP cho phép domain Tawk.to) → cors (allowlist từ config, credentials: true) → express.json({limit: '100kb'}) → cookie-parser → rate limit toàn cục (300 req/phút theo userId nếu có, ngược lại theo IP) → router /api/v1 → notFound → errorHandler.
2. api/src/lib/problem.ts: class AppError(status, type, title, detail?, errors?) và các helper: badRequest, unauthenticated, forbidden, notFound, conflict, versionMismatch, validationFailed(errors), rateLimited, payloadTooLarge.
3. api/src/middlewares/errorHandler.ts: chuyển AppError, ZodError (→ 422 kèm errors[] theo field), lỗi Prisma P2002 (→ 409), P2025 (→ 404) và lỗi khác (→ 500, không lộ stack ở production) thành Problem Details.
4. api/src/middlewares/validate.ts: validate({body?, query?, params?}) dùng Zod, gán dữ liệu đã parse vào req.
5. api/src/server.ts: khởi động, graceful shutdown (SIGTERM/SIGINT: ngừng nhận request, chờ tối đa 10 giây, đóng Prisma).
6. Route GET /api/v1/health/live và /health/ready (ready kiểm tra DB bằng SELECT 1).
Express 5 tự bắt lỗi async – không cần wrapper asyncHandler. Viết 3 test Supertest: health live, route không tồn tại trả 404 Problem Details, body sai JSON trả 400.
```

---

## GIAI ĐOẠN 2 – CƠ SỞ DỮ LIỆU

### P2.1-A – Chốt thiết kế Prisma schema cho MySQL 🔴 (Quyết định)

> 🔴 **Cao cấp/suy luận** – Sai schema thì sửa rất đắt về sau. Có nhiều điểm Prisma không biểu diễn được (CHECK, cột sinh, UUID v7) cần quyết định có chủ đích.

```text
[Dán Khối ngữ cảnh chung]
[Đính kèm: toàn bộ chương 6 – Thiết kế cơ sở dữ liệu]

KHÔNG VIẾT CODE. Hãy đóng vai kiến trúc sư dữ liệu và ra quyết định cho các vấn đề sau, mỗi vấn đề nêu 2–3 phương án, ưu/nhược điểm, và CHỐT một phương án kèm lý do:

1. UUID v7 dạng CHAR(36): sinh ở ứng dụng (thư viện nào) hay DB? Ảnh hưởng tới Prisma @default.
2. Bảng categories cần UNIQUE(owner_key, name, type) với owner_key = COALESCE(user_id,'SYSTEM') là cột sinh. Prisma không hỗ trợ cột sinh. Phương án: (a) cột sinh + unique index viết tay trong migration SQL, khai báo trong Prisma thế nào để migrate không cố xóa nó; (b) bỏ cột sinh, kiểm tra trùng ở service; (c) phương án khác.
3. CHECK constraint (amount > 0, alert_threshold_pct 50–100, interval_count 1–12, ...): liệt kê ĐẦY ĐỦ các CHECK cần viết tay trong migration theo từ điển dữ liệu.
4. Kiểu Decimal của Prisma: cách chuyển sang chuỗi "12.50" ở tầng API một cách nhất quán (serializer chung hay từng DTO).
5. Idempotency-Key (mục 7.1 lưu 24 giờ) chưa có bảng trong từ điển dữ liệu: thiết kế bảng idempotency_keys (cột, khóa, TTL, cách dọn).
6. Xóa mềm (deleted_at) với Prisma: dùng Prisma Client extension để tự lọc hay lọc thủ công ở repository? Rủi ro quên lọc.
7. Múi giờ: txn_date là DATE theo giờ địa phương người dùng; ranh giới tháng tính theo timezone trong users. Chốt cách tính "tháng hiện tại" ở backend.
8. Prisma relation mode và onDelete cho từng khóa ngoại theo từ điển dữ liệu (CASCADE / RESTRICT / SET NULL).

Kết quả trả về dạng một tài liệu ADR (Markdown) có tiêu đề "ADR-DB-01: Thiết kế schema Prisma cho MySQL", mỗi quyết định một mục, kết thúc bằng checklist những gì migration SQL phải viết tay.
```

### P2.1-B – Viết Prisma schema và migration 🔵 (Thi công)

> 🔵 **Tầm trung agentic** – Nhiều model, nhiều file (schema, migration SQL chỉnh tay, extension), cần bám sát ADR.

```text
[Dán Khối ngữ cảnh chung]
[Đính kèm: chương 6 + kết quả ADR-DB-01 từ bước A]

Hiện thực đúng ADR-DB-01:
1. api/prisma/schema.prisma: đầy đủ các bảng users, refresh_tokens, auth_tokens, categories, transactions, transaction_history, recurring_rules, budgets, insights, tip_templates, user_tips, notifications, bookmarks, ai_category_rules, import_batches, import_rows (nếu ADR có), recent_activity, announcements, audit_logs, idempotency_keys. Dùng @map/@@map để tên bảng/cột snake_case trong DB, camelCase trong code. Khai báo đủ index theo mục 6.4.
2. Tạo migration đầu bằng: prisma migrate dev --create-only --name init. Sau đó CHỈNH TAY file migration.sql để thêm: toàn bộ CHECK constraint, cột sinh owner_key + unique index (nếu ADR chọn), và mọi thứ ADR liệt kê.
3. api/src/lib/prisma.ts: PrismaClient singleton + extension theo ADR (xóa mềm, serialize Decimal).
4. api/src/lib/ids.ts: hàm newId() sinh UUID v7.
5. Script npm: db:migrate, db:reset, db:studio, db:export-schema (dùng mysqldump --no-data xuất ra /database/campus_coin_schema.sql).
Sau khi xong: liệt kê từng CHECK đã thêm và câu SQL để tôi tự kiểm tra (SHOW CREATE TABLE ...).
```

### P2.2 – Seed dữ liệu khởi tạo

> 🟢 **Rẻ/nhanh** – Dữ liệu tĩnh theo danh sách có sẵn.

```text
[Dán Khối ngữ cảnh chung]
[Đính kèm: mục 6.5 Dữ liệu khởi tạo, mục 5.3 Danh mục, mục 5.10 Bảng quy tắc mẹo]

Viết api/prisma/seed/base.ts (idempotent – chạy lại không tạo trùng, dùng upsert):
- Danh mục mặc định theo SRS. Thu: Allowance, Part-time Job, Scholarship, Gift, Other Income. Chi: Food, Transport, Hostel/Rent, Academics, Subscriptions, Entertainment, Miscellaneous. Mỗi danh mục có icon (tên Bootstrap Icons), màu HEX, sort_order.
- tip_templates cho các quy tắc R0–R6 bằng tiếng Anh (locale = 'en'), dùng biến {category}, {amount}, {percent}, {count}.
- 1 tài khoản admin lấy email/mật khẩu từ biến môi trường SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD (băm argon2id).
- Từ điển ~300 từ khóa phân loại tiếng Anh (cafe, coffee, lunch, canteen, pizza, grab, uber, bus, metro, rent, dorm, netflix, spotify, textbook, tuition, stationery, cinema, ...) lưu ở api/src/modules/ai/keywords.ts dạng Map<keyword, categoryName> – file riêng, không đưa vào DB.
Script: npm run db:seed.
```

---

## GIAI ĐOẠN 3 – XÁC THỰC VÀ PHIÊN

### P3.1-A – Chốt thiết kế token và phiên 🔴 (Quyết định)

> 🔴 **Cao cấp/suy luận** – Đây là phần bảo mật quan trọng nhất; lỗi thiết kế (vd. phát hiện reuse sai khi 2 tab cùng refresh) gây đăng xuất oan hoặc lỗ hổng chiếm phiên.

```text
[Dán Khối ngữ cảnh chung]
[Đính kèm: mục 5.1, 6.3.2, 7.3.1, 7.4, 9.5, 9.6]

KHÔNG VIẾT CODE. Hãy chốt thiết kế chi tiết cho hệ thống xác thực, trả lời từng câu:
1. Access token: thuật toán ký (EdDSA hay RS256), claims (sub, role, sid, iat, exp, kid), TTL 15 phút, nơi lưu phía client (bộ nhớ).
2. Refresh token: chuỗi ngẫu nhiên 256-bit, lưu SHA-256 trong refresh_tokens; cookie tên gì, thuộc tính (HttpOnly, Secure, SameSite=Strict, Path=/api/v1/auth). Cookie riêng cho admin hay dùng chung?
3. Xoay vòng + phát hiện dùng lại: thuật toán cụ thể với family_id. XỬ LÝ TRƯỜNG HỢP 2 tab/2 request refresh gần như đồng thời (đề xuất grace window bao nhiêu giây, trả về gì cho request thứ hai) để không bị coi nhầm là tấn công.
4. Khóa tài khoản: failed_login_count, locked_until 15 phút sau 5 lần sai; chống dò email (thông điệp chung + vẫn chạy argon2 với hash giả khi email không tồn tại).
5. Xác minh email và reset mật khẩu: định dạng token, TTL (24 giờ / 30 phút), dùng một lần, vô hiệu token cũ khi tạo mới; đổi mật khẩu → thu hồi mọi refresh token.
6. Admin: /admin/auth/login chỉ nhận role=admin, TTL access 10 phút, idle timeout 30 phút – cài đặt thế nào không cần MFA.
7. CSRF: vì refresh dùng cookie, cần kiểm tra Origin/Referer ở /auth/refresh và /auth/logout – mô tả cách làm.
8. Tham số argon2id (memoryCost, timeCost, parallelism) hợp lý cho VPS 2 vCPU.
9. Danh sách audit log cần ghi ở luồng xác thực.
Trả về ADR-AUTH-01 dạng Markdown, kèm sơ đồ trạng thái của một refresh token (active → rotated → revoked) bằng Mermaid.
```

### P3.1-B – Hiện thực module auth backend 🔵 (Thi công)

> 🔵 **Tầm trung agentic** – Module lớn (routes, service, repository, token lib, mailer, rate limit) cần làm đúng ADR đã chốt.

```text
[Dán Khối ngữ cảnh chung]
[Đính kèm: kết quả ADR-AUTH-01, mục 7.3.1, 7.4]

Hiện thực module api/src/modules/auth theo ĐÚNG ADR-AUTH-01:
- Endpoints: POST /auth/register (202), /auth/verify-email, /auth/resend-verification, /auth/login, /auth/refresh, /auth/logout, /auth/logout-all, /auth/forgot-password (luôn 202), /auth/reset-password, POST /admin/auth/login.
- api/src/lib/tokens.ts: signAccessToken, verifyAccessToken (jose), generateOpaqueToken, sha256.
- api/src/middlewares/authenticate.ts (đọc Bearer, gắn req.user = {id, role, sessionId}) và authorize(...roles).
- api/src/integrations/mailer.ts (Nodemailer, template HTML + text bằng tiếng Anh cho: xác minh email, đặt lại mật khẩu, mật khẩu vừa đổi) – gửi không chặn phản hồi, có retry 3 lần, lỗi thì log.
- Rate limit riêng theo bảng 7.4 cho login, register, forgot-password, resend-verification (express-rate-limit, keyGenerator theo IP + email).
- Schema Zod dùng chung đặt ở packages/shared (registerSchema: mật khẩu ≥ 10 ký tự, chặn 1.000 mật khẩu phổ biến nhất – file danh sách riêng).
- Ghi audit_logs theo ADR.
Test Supertest bắt buộc: đăng ký → xác minh → đăng nhập; sai mật khẩu 5 lần bị khóa; refresh xoay vòng; dùng lại refresh cũ → thu hồi cả family; 2 refresh đồng thời trong grace window không bị thu hồi; sinh viên gọi /admin/* bị 403; reset mật khẩu thu hồi phiên cũ.
```

### P3.2 – Hồ sơ người dùng và phiên đăng nhập

> 🟢 **Rẻ/nhanh** – CRUD đơn giản trên nền auth đã có.

```text
[Dán Khối ngữ cảnh chung]
[Đính kèm: mục 5.2, 7.3.1 (các endpoint /me)]

Tạo module api/src/modules/me:
- GET/PATCH /me: cập nhật fullName, academicYear, monthlyAllowanceBaseline, monthlySavingsGoal, currency (USD|VND), timezone (IANA hợp lệ), preferences {theme, fontScale}, aiOptIn. Không cho sửa email, role, status.
- PATCH /me/password: cần mật khẩu hiện tại; thành công thì thu hồi mọi refresh token trừ phiên hiện tại.
- GET /me/sessions, DELETE /me/sessions/:id.
- GET /me/export: trả JSON toàn bộ dữ liệu cá nhân (hồ sơ, danh mục, giao dịch, ngân sách, nhận định).
- DELETE /me: yêu cầu nhập lại mật khẩu; đặt deleted_at (ân hạn 30 ngày), thu hồi mọi phiên.
Kèm test: không sửa được role qua PATCH /me; đổi mật khẩu sai mật khẩu cũ → 422.
```

### P3.3 – Frontend: auth, axios interceptor, route bảo vệ

> 🔵 **Tầm trung agentic** – Logic refresh đồng thời phía client dễ sai; nhiều file (context, axios, route guard, 6 trang).

```text
[Dán Khối ngữ cảnh chung]
[Đính kèm: mục 4.3 Kiến trúc Frontend, 8.1 Sitemap, ADR-AUTH-01]

Xây dựng phần xác thực cho web:
1. src/lib/api.ts: axios instance baseURL /api/v1, withCredentials. Interceptor request gắn access token từ bộ nhớ. Interceptor response: khi 401 type token-expired → gọi /auth/refresh MỘT LẦN duy nhất dù nhiều request cùng lỗi (dùng một promise dùng chung), xếp các request đang chờ và gửi lại; refresh thất bại → xóa phiên, điều hướng về /login (hoặc /admin/login nếu đang ở khu admin).
2. src/app/AuthProvider.tsx: lưu token + user trong React Context (KHÔNG localStorage); khi tải trang gọi /auth/refresh để khôi phục phiên.
3. src/app/ProtectedRoute.tsx theo role.
4. Trang: Login, Register (có thanh độ mạnh mật khẩu), VerifyEmail (đọc token từ URL), ForgotPassword, ResetPassword, AdminLogin – dùng React Hook Form + zodResolver với schema từ @campus-coin/shared; hiển thị lỗi theo field từ Problem Details errors[].
5. src/lib/problem.ts: hàm chuyển Problem Details thành lỗi form và toast.
Mọi chuỗi giao diện bằng tiếng Anh, đặt trong src/content/en.ts.
```

---

## GIAI ĐOẠN 4 – DANH MỤC

### P4.1 – Module danh mục (backend + frontend)

> 🔵 **Tầm trung agentic** – Có quy tắc nghiệp vụ (reassign khi xóa, không trùng tên theo loại) và cả FE lẫn BE.

```text
[Dán Khối ngữ cảnh chung]
[Đính kèm: mục 5.3, 6.3.3, 7.3.2 (categories), ADR-DB-01]

Backend api/src/modules/categories:
- GET /categories?type=income|expense: danh mục mặc định đang hoạt động + danh mục cá nhân của người dùng, sắp theo sortOrder.
- POST/PATCH /categories: chỉ danh mục cá nhân; tên không trùng trong cùng loại của người dùng và không trùng danh mục mặc định (409 conflict); giới hạn 50 danh mục cá nhân/người dùng.
- DELETE /categories/:id?reassignTo=: nếu đã có giao dịch thì BẮT BUỘC reassignTo (cùng loại, người dùng sở hữu hoặc mặc định), chuyển giao dịch trong một DB transaction rồi lưu trữ (is_active=false); chưa có giao dịch thì xóa hẳn.
- Không cho sửa/xóa danh mục mặc định qua API sinh viên.
Frontend src/features/categories: trang "Manage My Categories" với 2 tab Income/Expense, danh sách thẻ có icon và màu, modal thêm/sửa (chọn icon từ danh sách Bootstrap Icons, chọn màu), hộp thoại xóa có chọn danh mục thay thế. Hook TanStack Query: useCategories(type), useCreateCategory... invalidate đúng query key.
Test: xóa danh mục có giao dịch mà không reassignTo → 422; gán danh mục người khác → 404.
```

---

## GIAI ĐOẠN 5 – GIAO DỊCH

### P5.1-A – Chốt thiết kế ghi giao dịch, lịch sử và sự kiện 🔴 (Quyết định)

> 🔴 **Cao cấp/suy luận** – Liên quan tính toàn vẹn dữ liệu: khóa lạc quan, lịch sử append-only, idempotency, thứ tự phát sự kiện sau commit.

```text
[Dán Khối ngữ cảnh chung]
[Đính kèm: mục 4.6, 5.4, 6.3.4, 7.1 (Idempotency, version), ADR-DB-01]

KHÔNG VIẾT CODE. Chốt thiết kế cho:
1. Luồng tạo/sửa/xóa mềm/khôi phục giao dịch: các bước trong MỘT DB transaction (ghi transactions + transaction_history), và thời điểm phát sự kiện nội bộ (chỉ SAU commit). Nếu handler lỗi thì sao?
2. Khóa lạc quan với cột version: câu UPDATE cụ thể (WHERE id AND user_id AND version), cách trả 409 version-mismatch kèm bản mới nhất.
3. Nội dung snapshot và changed_fields trong transaction_history (định dạng JSON).
4. Idempotency-Key cho POST /transactions: lưu gì, trả gì khi gửi lặp (cùng key, khác body → 422).
5. Chuẩn hóa merchant_key (quy tắc mục 5.6) – đặt ở đâu để dùng chung cho AI, trùng lặp, CSV.
6. Event bus nội bộ: interface TypedEventEmitter, danh sách sự kiện (transaction.created | updated | deleted | restored) và payload; handler chạy tuần tự hay song song; cách bảo đảm lỗi handler không làm hỏng response.
7. Bộ lọc danh sách (mục 5.4 BR-TX-08): cách dựng where của Prisma an toàn; tìm theo từ khóa mô tả dùng LIKE hay FULLTEXT (với quy mô A-02).
Trả về ADR-TX-01 dạng Markdown.
```

### P5.1-B – Hiện thực module giao dịch backend 🔵 (Thi công)

> 🔵 **Tầm trung agentic** – Module lớn nhất của nghiệp vụ lõi, nhiều endpoint và test.

```text
[Dán Khối ngữ cảnh chung]
[Đính kèm: ADR-TX-01, mục 5.4, 7.3.2 (transactions)]

Hiện thực api/src/modules/transactions và api/src/events theo ADR-TX-01:
- GET /transactions (lọc from, to, type, categoryId nhiều giá trị, q, minAmount, maxAmount, sort; phân trang page/limit ≤ 100, trả meta).
- GET /transactions/:id (ghi recent_activity 'viewed', giữ 20 bản ghi/người).
- POST /transactions (Idempotency-Key, tùy chọn recurring: tạo recurring_rule kèm).
- PATCH /transactions/:id (yêu cầu version; ghi recent_activity 'edited').
- DELETE /transactions/:id (xóa mềm), POST /transactions/:id/restore (trong 30 ngày), GET /transactions/:id/history, GET /transactions/trash.
- Validate BR-TX-01..04: số tiền > 0, tối đa 2 chữ số thập phân (VND: 0), ngày trong khoảng cho phép theo timezone người dùng, danh mục cùng loại và thuộc người dùng hoặc mặc định.
- Event bus api/src/events/bus.ts + đăng ký handler rỗng (BudgetAlert, Anomaly, AiLearning sẽ làm ở giai đoạn sau).
Test bắt buộc: người A không đọc/sửa/xóa được giao dịch người B (404); sửa với version cũ → 409; gửi lặp cùng Idempotency-Key không tạo 2 giao dịch; xóa rồi khôi phục có đủ 3 dòng lịch sử; ngày tương lai quá 1 ngày → 422.
```

### P5.2 – Frontend: danh sách giao dịch, thêm nhanh, thùng rác, lịch sử

> 🔵 **Tầm trung agentic** – Nhiều component tương tác (bảng lọc, modal thêm nhanh, phím tắt, lịch sử) và đồng bộ URL query.

```text
[Dán Khối ngữ cảnh chung]
[Đính kèm: mục 5.4.1, 8.3 (màn hình giao dịch), 8.6 Trạng thái giao diện, 5.15]

Xây dựng src/features/transactions:
1. QuickAddModal: loại Income/Expense (mặc định Expense), số tiền (ô nhập định dạng theo tiền tệ người dùng, số dạng tabular), ngày (mặc định hôm nay), mô tả, danh mục (CategorySelect – để sẵn chỗ cho chip "AI suggestion" ở Giai đoạn 9), công tắc "Repeat" mở thêm các trường định kỳ. Phím tắt: N mở, Enter lưu, Esc đóng. Mở được từ navbar, dashboard và nút nổi (FAB) trên mobile.
2. Trang Giao dịch: bộ lọc (khoảng ngày có preset, loại, nhiều danh mục, khoảng tiền, từ khóa) đồng bộ lên URL query; bảng trên desktop, danh sách thẻ trên mobile; phân trang; sửa inline qua modal (gửi version, xử lý 409 bằng hộp thoại "This transaction was changed elsewhere – reload?").
3. Trang Trash (thùng rác): khôi phục trong 30 ngày.
4. Drawer Lịch sử thay đổi của một giao dịch (hiển thị trường nào đổi từ gì sang gì).
5. Trạng thái rỗng có hướng dẫn "Log your first transaction", skeleton khi tải, toast khi lưu.
Mọi số tiền hiển thị qua một hàm formatMoney(amountString, currency) (định dạng en-US: $1,234.50; VND không có phần thập phân) duy nhất ở src/lib/money.ts.
```

---

## GIAI ĐOẠN 6 – GIAO DỊCH ĐỊNH KỲ VÀ TÁC VỤ NỀN

### P6.1 – Lập lịch node-cron và sinh giao dịch định kỳ

> 🔵 **Tầm trung agentic** – Có logic ngày tháng dễ sai (ngày 31, catch-up, múi giờ) và idempotency; nên để mô hình agentic viết kèm test đầy đủ.

```text
[Dán Khối ngữ cảnh chung]
[Đính kèm: mục 4.5 (bảng tác vụ nền), 5.4.2, 6.3.5 (recurring_rules)]

1. api/src/jobs/scheduler.ts: đăng ký các job node-cron với timezone 'Asia/Ho_Chi_Minh', chỉ chạy khi ENABLE_CRON=true (để test không chạy cron). Mỗi job bọc try/catch, log thời gian chạy, không để lỗi làm sập process. Có cờ chống chạy chồng (nếu lượt trước chưa xong thì bỏ qua lượt này).
2. api/src/jobs/recurring.ts – chạy 00:05 hằng ngày: lấy recurring_rules is_active với next_run_date ≤ hôm nay; với mỗi quy tắc sinh giao dịch source='recurring' cho TỪNG kỳ đến hạn (catch-up tối đa 12 kỳ), recurring_period dạng '2026-09' (tháng) / '2026-W38' (tuần) / '2026' (năm); dựa vào UNIQUE(recurring_rule_id, recurring_period) để không bao giờ sinh trùng (bắt lỗi P2002 và bỏ qua). Ngày 29–31 ở tháng thiếu ngày → ngày cuối tháng. Vượt end_date → is_active=false. Phát sự kiện transaction.created cho mỗi giao dịch sinh ra.
3. api/src/jobs/cleanup.ts – 03:00 hằng ngày: xóa token hết hạn > 7 ngày, bản nháp import > 24 giờ, idempotency_keys > 24 giờ, giao dịch xóa mềm > 30 ngày (ẩn danh hóa lịch sử), tài khoản yêu cầu xóa > 30 ngày.
4. Module api/src/modules/recurring-rules: GET/POST/PATCH/DELETE /recurring-rules (sửa chỉ áp dụng kỳ tương lai; tạm dừng/tiếp tục).
5. Hàm thuần computeNextRunDate(rule, fromDate) tách riêng để unit test.
Unit test: quy tắc ngày 31 qua tháng 2 (năm nhuận và không nhuận); chạy job 2 lần cùng ngày không sinh trùng; hệ thống ngừng 3 tháng → catch-up đủ 3 kỳ; weekly interval 2.
```

---

## GIAI ĐOẠN 7 – NGÂN SÁCH, CẢNH BÁO, THÔNG BÁO

### P7.1 – Ngân sách, handler cảnh báo và thông báo

> 🔵 **Tầm trung agentic** – Kết hợp module budgets, handler sự kiện, bảng notifications và FE chuông thông báo.

```text
[Dán Khối ngữ cảnh chung]
[Đính kèm: mục 5.11, 6.3.5 (budgets), 6.3.7 (notifications), 7.3.3 (budgets, notifications), Hình 21]

Backend:
- api/src/modules/budgets: GET /budgets?month= (kèm spent, percent, level: ok|near|exceeded), PUT /budgets (upsert hàng loạt cho một tháng, chỉ danh mục chi), POST /budgets/copy-previous, DELETE /budgets/:id.
- api/src/events/handlers/budgetAlert.ts: khi có giao dịch CHI created/updated/deleted/restored → tính spent tháng của danh mục; nếu ≥ ngưỡng → NEAR_LIMIT, ≥ 100% → EXCEEDED; tạo notification với dedupe_key = `budget:{budgetId}:{level}:{month}` (UNIQUE) để chỉ gửi một lần; nếu spent giảm xuống dưới ngưỡng thì xóa dedupe_key tương ứng để cho phép cảnh báo lại.
- api/src/modules/notifications: GET /notifications (phân trang, unread count), POST /notifications/:id/read, POST /notifications/read-all.
Frontend:
- Trang Ngân sách: chọn tháng, bảng danh mục chi với ô nhập hạn mức và ngưỡng (50–100%), progress bar xanh < 80% / vàng 80–99% / đỏ ≥ 100% (kèm chữ, không chỉ dựa vào màu), nút "Copy last month".
- NotificationBell trên navbar: badge số chưa đọc, dropdown danh sách; refetchInterval 60 giây và invalidate ngay sau mutation giao dịch; toast khi có thông báo ngân sách mới.
Test: vượt ngưỡng 2 lần trong tháng chỉ tạo 1 thông báo; xóa giao dịch cho giảm dưới ngưỡng rồi vượt lại → tạo thông báo mới.
```

---

## GIAI ĐOẠN 8 – DASHBOARD VÀ BÁO CÁO

### P8.1 – Truy vấn tổng hợp và API dashboard/báo cáo

> 🔵 **Tầm trung agentic** – Nhiều truy vấn SQL tổng hợp phải đúng múi giờ và dùng đúng chỉ mục.

```text
[Dán Khối ngữ cảnh chung]
[Đính kèm: mục 5.7 (bảng widget), 5.8, 6.4 Chỉ mục, 7.3.3 (dashboard, reports), 10.1]

Tạo api/src/modules/analytics với repository dùng Prisma $queryRaw (tham số hóa bằng tagged template, KHÔNG nối chuỗi) cho các truy vấn tổng hợp:
- GET /dashboard/summary?month=YYYY-MM: greeting data, totals {income, expense, net, vsPrevMonthPct}, topCategory, budgetVsActual[], categoryBreakdown[], trend6Months[], savingsGoalProgress, latestInsight (tóm tắt), recentActivity[], activeAnnouncements[]. Tips để trống (Giai đoạn 12 bổ sung).
- GET /reports/category-breakdown?from&to&type&categoryId: tổng, tỷ trọng %, số giao dịch, so sánh kỳ trước cùng độ dài.
- GET /reports/income-vs-expense?months=6: thu, chi, tiết kiệm ròng từng tháng (tháng không có dữ liệu vẫn trả 0).
- GET /reports/daily-weekly?month=: theo ngày và theo tuần ISO, kèm trung bình ngày.
Yêu cầu: ranh giới tháng tính theo timezone người dùng; loại giao dịch deleted_at; số tiền trả dạng chuỗi; mỗi truy vấn ghi chú chỉ mục nào nó dùng. Dùng EXPLAIN để kiểm tra và dán kết quả EXPLAIN của 2 truy vấn nặng nhất vào phần giải thích.
Test với dữ liệu mẫu: tổng theo tháng đúng khi có giao dịch ngày 31 lúc 23:30 giờ Việt Nam.
```

### P8.2 – Frontend dashboard và báo cáo

> 🔵 **Tầm trung agentic** – Nhiều widget và biểu đồ, lazy-load Chart.js, dark mode cho biểu đồ.

```text
[Dán Khối ngữ cảnh chung]
[Đính kèm: mục 5.7, 5.8, 8.2 Design tokens, 8.3, 8.4 Responsive]

1. src/components/charts: ChartCard, DoughnutChart, GroupedBarChart, LineChart – bọc react-chartjs-2, lazy-load Chart.js (React.lazy), bảng màu lấy từ CSS variables để tự đổi theo dark mode, có bảng dữ liệu thay thế ẩn cho trình đọc màn hình (aria).
2. Trang Dashboard theo bảng widget mục 5.7: lưới Bootstrap responsive (1 cột mobile, 2 cột tablet, 3 cột desktop); skeleton riêng từng widget; Error Boundary từng widget.
3. Trang Báo cáo có 4 tab: Theo danh mục, Thu vs Chi 6 tháng, Ngày/Tuần tháng này, Dự báo (để placeholder, làm ở Giai đoạn 13). Bộ lọc dùng chung đồng bộ URL query. Nút "Export PNG" dùng html-to-image chụp vùng báo cáo.
4. Breadcrumbs sinh tự động từ cấu hình route (handle.crumb của React Router).
```

### P8.3-A – Chốt cách sinh PDF có biểu đồ 🔴 (Quyết định)

> 🔴 **Cao cấp/suy luận** – Chọn sai (vd. thư viện cần canvas native) sẽ vỡ build Docker alpine và tốn thời gian gỡ lỗi.

```text
[Dán Khối ngữ cảnh chung]
[Đính kèm: mục 5.8, ADR-09 (pdfmake), mục 9.10]

KHÔNG VIẾT CODE. Báo cáo PDF tháng cần: trang bìa, bảng tổng hợp, biểu đồ (doughnut theo danh mục, cột 6 tháng), top giao dịch, nhận định tháng, ghi chú "Not financial advice"; toàn bộ nội dung PDF bằng tiếng Anh nhưng font phải hiển thị đúng tên/mô tả có dấu tiếng Việt do người dùng nhập.
So sánh 3 cách đưa biểu đồ vào PDF phía server với pdfmake:
(a) chartjs-node-canvas (cần thư viện native canvas) – ảnh hưởng image node:24-alpine;
(b) tự sinh SVG đơn giản (doughnut, cột) bằng hàm TypeScript thuần rồi nhúng vào pdfmake (pdfmake hỗ trợ SVG);
(c) client gửi ảnh PNG biểu đồ lên khi xuất.
Đánh giá theo: độ phức tạp, dung lượng image Docker, bảo mật (SRS: không tải file độc hại), độ nhất quán giao diện, thời gian làm trong cuộc thi. Chốt một phương án. Chỉ rõ cách nhúng font Roboto/Noto Sans (có glyph tiếng Việt cho dữ liệu người dùng) vào pdfmake.
Trả về ADR-PDF-01.
```

### P8.3-B – Hiện thực xuất PDF và chia sẻ email 🔵 (Thi công)

> 🔵 **Tầm trung agentic** – Nhiều file (renderer, biểu đồ, route, mailer) theo quyết định đã chốt.

```text
[Dán Khối ngữ cảnh chung]
[Đính kèm: ADR-PDF-01, mục 5.8, 7.3.3 (export, share), 7.4]

- api/src/integrations/pdf: renderMonthlyReport(userId, month) theo ADR-PDF-01, dùng lại truy vấn của module analytics.
- GET /reports/monthly/export?month=&format=pdf: Content-Disposition attachment, tên file campus-coin-report-YYYY-MM.pdf, chỉ dữ liệu của chính người dùng.
- POST /reports/monthly/share {month, toEmail}: rate limit 5/ngày/người dùng; gửi PDF đính kèm qua mailer; nội dung email không chứa link công khai tới dữ liệu.
- Frontend: nút "Export PDF" (tải file khi người dùng bấm) và modal "Share via email".
Test: PDF sinh ra > 0 byte và có header %PDF; gọi share lần thứ 6 trong ngày → 429.
```

---

## GIAI ĐOẠN 9 – TRỢ LÝ PHÂN LOẠI AI

### P9.1-A – Chốt thiết kế AI Adapter và phân loại ba tầng 🔴 (Quyết định)

> 🔴 **Cao cấp/suy luận** – Liên quan quyền riêng tư (dữ liệu gửi ra ngoài), chi phí, prompt injection và độ tin cậy; đây cũng là điểm giám khảo hỏi nhiều nhất.

```text
[Dán Khối ngữ cảnh chung]
[Đính kèm: mục 3.4, 5.6, 9.9 An toàn khi dùng AI, 6.3.7 (ai_category_rules), 7.4]

KHÔNG VIẾT CODE. Chốt thiết kế:
1. Interface AiProvider chung (categorize, generateInsight) để đổi Gemini ↔ OpenAI ↔ none; cách bật structured output JSON theo schema của từng nhà cung cấp.
2. Thuật toán chuẩn hóa merchant_key (chữ thường, bỏ dấu – kể cả dấu tiếng Việt nếu người dùng gõ, bỏ số, ký tự đặc biệt, từ dừng) – liệt kê từ dừng tiếng Anh (at, the, from, for, to, ...).
3. Tầng 1 (luật cá nhân): cách tính confidence (0,95 khi hit_count ≥ 2, 0,8 khi = 1); quy tắc "luật mới thay luật cũ nếu bị sửa 2 lần liên tiếp" – cần thêm cột gì?
4. Tầng 2 (từ khóa): khớp theo token hay substring; xử lý xung đột nhiều từ khóa.
5. Tầng 3 (LLM): prompt system/user với ranh giới rõ ràng chống prompt injection từ mô tả người dùng; làm sạch PII (regex email, SĐT Việt Nam, số tài khoản/thẻ); chỉ gửi mô tả đã làm sạch + danh sách tên danh mục; loại kết quả không thuộc danh sách; giới hạn confidence ≤ 0,9; timeout 3 giây.
6. Cache LRU trong bộ nhớ: key, kích thước tối đa, TTL 7 ngày; quota 200 lời gọi LLM/người dùng/ngày – đếm ở đâu khi không có Redis (bảng DB hay bộ nhớ? Chấp nhận mất đếm khi restart không?).
7. Chỉ gọi LLM khi user.aiOptIn = true; lỗi/timeout trả gợi ý rỗng, không chặn lưu giao dịch.
8. Cách đo độ chính xác: tỷ lệ ai_accepted / (ai_accepted + ai_overridden) cho admin.
Viết sẵn NGUYÊN VĂN prompt tầng 3 (system + user template) và JSON schema đầu ra. Trả về ADR-AI-01.
```

### P9.1-B – Hiện thực phân loại AI backend 🔵 (Thi công)

> 🔵 **Tầm trung agentic** – Module nhiều lớp (adapter, 3 tầng, cache, quota, feedback, handler học).

```text
[Dán Khối ngữ cảnh chung]
[Đính kèm: ADR-AI-01, mục 5.6, 7.3.2 (/ai/*)]

Hiện thực đúng ADR-AI-01:
- api/src/integrations/ai/{provider.ts, gemini.ts, openai.ts, none.ts, index.ts}: chọn provider theo AI_PROVIDER.
- api/src/modules/ai/{normalize.ts, keywords.ts, categorizer.service.ts, routes.ts}: POST /ai/categorize/suggest {description, amount, type} → {categoryId, categoryName, confidence, source: user_rule|keyword|llm} hoặc {suggestion: null}; POST /ai/feedback {description, suggestedCategoryId, chosenCategoryId}.
- api/src/events/handlers/aiLearning.ts: khi giao dịch có category_source user/ai_overridden → upsert ai_category_rules.
- Rate limit 60 lần/phút/người dùng.
Unit test: normalize("Campus Café #12") = "campus cafe"; tầng 1 thắng tầng 2; LLM trả danh mục không hợp lệ → bị loại; aiOptIn=false không bao giờ gọi provider (mock); PII bị xóa trước khi gửi.
```

### P9.2 – Frontend: chip "AI suggestion" trong form giao dịch

> 🟢 **Rẻ/nhanh** – Component nhỏ trên API đã có; logic debounce và hủy request là mẫu quen thuộc.

```text
[Dán Khối ngữ cảnh chung]
[Đính kèm: mục 5.6 (phía client), Hình 12]

Cập nhật CategorySelect trong QuickAddModal:
- Khi mô tả ≥ 3 ký tự và người dùng bật AI: debounce 400 ms gọi /ai/categorize/suggest, hủy request cũ bằng AbortController.
- confidence ≥ 0,6 → tự điền danh mục + chip "AI suggestion" (tooltip giải thích nguồn: "Your rule" / "Keyword" / "AI"); < 0,6 → hiện top gợi ý dạng nút chọn nhanh.
- Khi lưu: đặt categorySource = ai_accepted nếu giữ nguyên, ai_overridden nếu đổi, user nếu không có gợi ý; gửi kèm aiSuggestedCategoryId, aiConfidence.
- Lỗi AI không hiện lỗi đỏ, không chặn nút Lưu.
Thêm công tắc "Enable AI suggestions" trong trang Hồ sơ kèm đoạn giải thích dữ liệu nào được gửi (theo mục 9.9).
```

---

## GIAI ĐOẠN 10 – NHẬP CSV

### P10.1 – Nhập CSV ba bước (backend + frontend)

> 🔵 **Tầm trung agentic** – Nhiều ca biên (định dạng ngày, dấu thập phân, BOM, trùng lặp) và luồng 3 bước FE/BE; cần test kỹ.

```text
[Dán Khối ngữ cảnh chung]
[Đính kèm: mục 5.5 (bảng định dạng CSV), 9.10 An toàn file, 6.3.7 (import_batches), 7.3.2 (/imports), Hình 15]

Backend api/src/modules/imports (xử lý đồng bộ trong request, không dùng hàng đợi):
- GET /imports/template: file CSV mẫu (date,amount,type,description,category) có 3 dòng ví dụ.
- POST /imports (multer memoryStorage, giới hạn 2 MB, chỉ .csv, kiểm tra MIME và nội dung): tính SHA-256 file → trùng UNIQUE(user_id, file_sha256) trả 409; loại BOM; tự nhận dấu phân tách , hoặc ;; parse bằng csv-parse; ≤ 5.000 dòng; validate từng dòng; nhận dạng ngày theo định dạng người dùng chọn (YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY); số tiền chấp nhận "." hoặc ","; type suy từ dấu âm nếu thiếu; khớp tên danh mục, nếu trống thì phân loại hàng loạt (theo lô 50 mô tả qua categorizer); đánh dấu dòng trùng giao dịch đã có (cùng ngày, số tiền, merchant_key) và mặc định bỏ chọn. Không lưu file gốc. Trả 200 {batchId, preview, errors}.
- GET /imports/:id, PATCH /imports/:id/rows (sửa danh mục, bỏ chọn dòng), POST /imports/:id/commit (Idempotency-Key; MỘT DB transaction; source='csv_import'; ghi history; phát sự kiện), DELETE /imports/:id.
- Chống CSV injection khi xuất báo cáo lỗi: tiền tố ' cho ô bắt đầu bằng = + - @.
Frontend: trang Nhập CSV 3 bước (Tải lên → Xem trước & chỉnh → Kết quả), bảng xem trước có tô màu dòng lỗi/dòng trùng, chọn định dạng ngày, sửa danh mục từng dòng, nút tải báo cáo lỗi.
Test: file có BOM; file dùng ";" và số "4,50"; dòng thiếu amount báo lỗi đúng số dòng; commit 2 lần cùng Idempotency-Key chỉ nhập 1 lần; file 3 MB → 413.
```

---

## GIAI ĐOẠN 11 – NHẬN ĐỊNH HẰNG THÁNG BẰNG AI

### P11.1-A – Chốt thuật toán thống kê và kiểm soát đầu ra LLM 🔴 (Quyết định)

> 🔴 **Cao cấp/suy luận** – Thuật toán thống kê và bộ kiểm tra "chống bịa số" quyết định độ tin cậy của tính năng; cần suy luận cẩn thận về ca biên.

```text
[Dán Khối ngữ cảnh chung]
[Đính kèm: mục 5.9.1, 5.9.2, 6.3.6 (insights), Hình 18, Hình 19]

KHÔNG VIẾT CODE. Chốt:
1. Đặc tả hàm computeMonthStats(userId, month): input, output JSON (dùng làm stats_snapshot), công thức cur, avg3 (bỏ tháng trống, cần ≥ 2 tháng), g, điều kiện flag (g ≥ 25% VÀ chênh lệch tuyệt đối ≥ max(5 đơn vị tiền, 5% trợ cấp cơ sở)), tỷ lệ tiết kiệm, danh mục mới, giao dịch bất thường lớn nhất, top 3 mẫu. Xử lý: trợ cấp cơ sở null, thu = 0, tiền VND.
2. Lời khuyên hành động: hạn mức tuần = avg3 / 4,33 làm tròn theo tiền tệ; bảng gợi ý thay thế theo danh mục.
3. Prompt LLM nguyên văn (system + user), JSON schema {summary_text, tip_text}, temperature 0,3, ≤ 120 từ, luôn bằng tiếng Anh.
4. Bộ kiểm tra đầu ra: parse schema; độ dài; trích mọi con số trong văn bản (cả dạng "40%", "12,50", "12.5 USD") và so khớp với tập số liệu cho phép (sai số làm tròn bao nhiêu); lọc từ khóa cấm (vay, đầu tư, crypto...). Không đạt → template.
5. Template dự phòng bằng tiếng Anh cho các trường hợp: có mẫu tăng, không có mẫu nào, tiết kiệm tốt.
6. Trạng thái job (queued → processing → completed/failed), retry 3 lần (2s, 8s, 32s) chỉ khi lỗi mạng/429/timeout; regenerate tối đa 3 lần/tháng.
Trả về ADR-INSIGHT-01 kèm 3 bộ dữ liệu ví dụ (input stats → output mong đợi) để làm test.
```

### P11.1-B – Hiện thực nhận định (backend + frontend) 🔵 (Thi công)

> 🔵 **Tầm trung agentic** – Nhiều phần (stats engine, validator, job cron, API, trang lịch sử) bám theo ADR.

```text
[Dán Khối ngữ cảnh chung]
[Đính kèm: ADR-INSIGHT-01, mục 7.3.3 (/insights)]

- api/src/modules/insights/{stats.ts, validator.ts, templates.ts, insight.service.ts, routes.ts}: hiện thực đúng ADR; stats.ts và validator.ts là hàm thuần để unit test.
- api/src/jobs/insights.ts: node-cron 00:30 ngày 1 hằng tháng cho user active có ≥ 5 giao dịch tháng trước; xử lý tuần tự từng user, lỗi một user không dừng lượt chạy; upsert insights UNIQUE(user_id, month); tạo notification insight_ready.
- GET /insights, GET /insights/:month, POST /insights/:month/regenerate (≤ 3 lần/tháng, 202).
- Frontend: trang Nhận định (danh sách theo tháng, chi tiết có các mẫu đã flag dạng thẻ, nhãn "AI-generated insight – for reference only", nút "Regenerate", nút Bookmark); widget "Nhận định mới nhất" trên dashboard.
Unit test dùng 3 bộ dữ liệu ví dụ trong ADR; test validator bắt được câu "chi Food tăng 55%" khi số liệu thật là 40%.
```

---

## GIAI ĐOẠN 12 – ENGINE MẸO TIẾT KIỆM

### P12.1 – Tips engine R0–R6 (backend + frontend)

> 🔵 **Tầm trung agentic** – Thuật toán đã được đặc tả rõ trong tài liệu (bảng quy tắc, công thức score) nên không cần bước quyết định riêng, nhưng nhiều quy tắc và test.

```text
[Dán Khối ngữ cảnh chung]
[Đính kèm: mục 5.10 (bảng quy tắc R0–R6 và công thức), 6.3.6 (tip_templates, user_tips), Hình 20]

Backend api/src/modules/tips:
- rules/*.ts: mỗi quy tắc R1–R6 là một hàm thuần evaluate(context) → TipCandidate[] {ruleType, categoryId?, impactAmount, variables}. context gồm: chi tiêu tháng này theo danh mục, spent_to_date, số ngày đã qua, avg3, budgets, giao dịch 7 ngày gần nhất, recurring subscriptions, thu tháng này, mục tiêu tiết kiệm, trợ cấp cơ sở.
- projected(c) chỉ áp dụng từ ngày thứ 5 của tháng. confidence theo số tháng lịch sử (0,5 / 0,75 / 1,0). score = impact × confidence × recency.
- tips.service.ts: tính lại khi người dùng mở dashboard/trang Mẹo nếu lần tính gần nhất > 10 phút; render nội dung từ tip_templates (escape mọi biến); lưu user_tips; bỏ tip dismissed trong 30 ngày (cùng quy tắc + danh mục); tip pinned luôn đứng đầu.
- GET /tips, POST /tips/:id/pin | unpin | dismiss. Bổ sung top 3 tips vào /dashboard/summary.
Frontend: widget Top 3 mẹo trên dashboard (nút Pin / Dismiss / Save), trang Mẹo xem tất cả.
Unit test từng quy tắc với dữ liệu biên (ngày thứ 4 của tháng không kích hoạt R1/R2; đúng 8 khoản nhỏ kích hoạt R3; 3 subscription kích hoạt R4).
```

---

## GIAI ĐOẠN 13 – TRÍ TUỆ HỆ THỐNG

### P13.1 – Phát hiện bất thường, trùng lặp, dự báo, hoạt động gần đây

> 🔵 **Tầm trung agentic** – Các thuật toán đã có công thức trong tài liệu; cần hiện thực trong handler sự kiện và API, kèm test thống kê.

```text
[Dán Khối ngữ cảnh chung]
[Đính kèm: mục 5.14 (bảng tính năng), 7.3.2 (resolve-flag), 7.3.3 (/forecast, /activity)]

1. api/src/events/handlers/anomaly.ts (khi transaction.created/updated):
   - Bất thường: danh mục có ≥ 5 giao dịch trong 90 ngày; amount > mean + 3σ HOẶC > 3 × median, VÀ > 20% trợ cấp cơ sở → is_anomaly = true + notification "Unusually large expense – is this correct?".
   - Trùng lặp: cùng user, cùng amount và type, cùng danh mục hoặc merchant_key Levenshtein ≤ 2, ngày chênh ≤ 1, tạo cách nhau ≤ 10 phút, không phải recurring → is_possible_duplicate = true + notification.
2. POST /transactions/:id/resolve-flag {flag: anomaly|duplicate, action: keep|delete}.
3. GET /forecast/next-month: mỗi danh mục = 0,5·M−1 + 0,3·M−2 + 0,2·M−3 cộng khoản định kỳ đã biết; khoảng ±1σ; < 2 tháng dữ liệu → {insufficientData: true}.
4. GET /activity/recent (20 bản ghi, đồng bộ đa thiết bị vì lưu server).
5. Frontend: badge cảnh báo trên dòng giao dịch bị gắn cờ kèm nút "Keep" / "Delete duplicate"; tab Dự báo trong trang Báo cáo (đường + vùng sai số); widget "Gần đây" trên dashboard.
Hàm thống kê (mean, stddev, median, levenshtein, weightedForecast) tách ra api/src/lib/stats.ts và có unit test.
```

---

## GIAI ĐOẠN 14 – BOOKMARK, QUẢN TRỊ, THÔNG BÁO HỆ THỐNG

### P14.1 – Bookmark và ghi chú

> 🟢 **Rẻ/nhanh** – CRUD đơn giản.

```text
[Dán Khối ngữ cảnh chung]
[Đính kèm: mục 5.12, 6.3.7 (bookmarks)]

Backend GET/POST/PATCH/DELETE /bookmarks (targetType: tip | insight | report; targetRef: id tip, tháng nhận định, hoặc chuỗi query bộ lọc báo cáo; note ≤ 500 ký tự; UNIQUE(user, type, ref) → 409).
Frontend: nút Bookmark dùng chung (BookmarkButton) đặt trên thẻ mẹo, trang nhận định, trang báo cáo (lưu bộ lọc hiện tại); trang "Saved" có tab theo loại và ô tìm theo ghi chú; mở bookmark báo cáo sẽ khôi phục đúng bộ lọc.
```

### P14.2-A – Chốt phạm vi quyền và quyền riêng tư của admin 🔴 (Quyết định)

> 🔴 **Cao cấp/suy luận** – Admin là vai trò đặc quyền; cần chốt rõ admin được thấy gì để không vi phạm yêu cầu "chỉ chủ sở hữu xem được dữ liệu tài chính".

```text
[Dán Khối ngữ cảnh chung]
[Đính kèm: mục 5.13 (bảng chức năng quản trị), 9.6, 9.12, 7.3.4]

KHÔNG VIẾT CODE. Chốt:
1. Danh sách trường admin được xem ở /admin/users và /admin/users/:id (không có giao dịch, số dư, mô tả).
2. Thống kê: định nghĩa chính xác DAU/MAU (dựa last_login_at hay audit), tổng giao dịch, danh mục dùng nhiều nhất, tỷ lệ chấp nhận AI, số nhận định; quy tắc ẩn nhóm < 5 người dùng (k-anonymity) áp dụng ở đâu.
3. Vô hiệu hóa tài khoản: thu hồi mọi phiên ngay; admin không tự vô hiệu hóa chính mình; không vô hiệu hóa admin cuối cùng.
4. Danh mục mặc định: "ẩn" thay vì xóa khi đã có giao dịch; đổi tên có ảnh hưởng dữ liệu lịch sử không.
5. Tip templates và announcements: lọc HTML thế nào (chỉ văn bản thuần hay allowlist), xem trước trước khi xuất bản.
6. Danh sách hành động admin phải ghi audit_logs và trường metadata.
Trả về ADR-ADMIN-01.
```

### P14.2-B – Hiện thực khu vực quản trị 🔵 (Thi công)

> 🔵 **Tầm trung agentic** – Nhiều trang CRUD và thống kê cả FE lẫn BE.

```text
[Dán Khối ngữ cảnh chung]
[Đính kèm: ADR-ADMIN-01, mục 7.3.4, 8.1 Sitemap (khu admin)]

Backend api/src/modules/admin (mọi route authorize('admin')): stats/overview, stats/categories-usage, users (tìm kiếm, phân trang), users/:id, users/:id/disable|enable, users/:id/send-reset, CRUD categories (mặc định), CRUD tip-templates, CRUD announcements, GET audit-logs (lọc thời gian, hành động, người thực hiện). Ghi audit đúng ADR. GET /announcements/active cho người dùng.
Frontend AdminLayout (menu riêng, tải lazy): Dashboard thống kê (thẻ số + biểu đồ), Người dùng, Danh mục mặc định (kéo thả sắp xếp), Mẫu mẹo (có ô xem trước khi thay biến bằng giá trị mẫu), Thông báo hệ thống (thời gian hiệu lực), Nhật ký kiểm toán (chỉ đọc).
Test: admin không gọi được API lấy giao dịch người dùng; vô hiệu hóa → refresh token của user đó bị thu hồi; sinh viên gọi /admin/* → 403.
```

---

## GIAI ĐOẠN 15 – GIAO DIỆN, TRUY CẬP, SITEMAP, CHATBOT

### P15.1 – Design system, layout, dark mode, cỡ chữ

> 🟢 **Rẻ/nhanh** – Chủ yếu SCSS và cấu hình theo design tokens có sẵn.

```text
[Dán Khối ngữ cảnh chung]
[Đính kèm: mục 8.2 Design tokens, 5.15, 8.4]

- src/styles: _tokens.scss (màu theo bảng 8.2 cho cả light/dark qua [data-bs-theme]), ghi đè biến Bootstrap 5.3, font Inter tự host (subset latin + vietnamese), số dạng tabular-nums cho cột tiền, bo góc 12px thẻ / 8px nút.
- ThemeProvider: dark mode theo prefers-color-scheme mặc định, công tắc trên navbar, lưu vào preferences (localStorage + PATCH /me).
- Font scale 4 mức (90/100/115/130%) đổi font-size của html; mọi kích thước dùng rem.
- Layout: PublicLayout, StudentLayout (navbar + sidebar desktop, bottom nav mobile, FAB thêm nhanh), AdminLayout.
- Chuyển trang 150–200 ms, tôn trọng prefers-reduced-motion; spinner trên nút đang xử lý.
- Trang 404 và trang lỗi chung.
```

### P15.2 – Trang chủ công khai, sitemap, chatbot Tawk.to

> 🟢 **Rẻ/nhanh** – Trang tĩnh và nhúng script theo hướng dẫn.

```text
[Dán Khối ngữ cảnh chung]
[Đính kèm: mục 8.1 Sitemap, 3.4 (Tawk.to), SRS mục 1.9 (sitemap bắt buộc ở trang chủ)]

- Landing page: hero giới thiệu Campus Coin (tagline "Smart Spending, Student Style"), 6 tính năng chính, ảnh chụp màn hình (placeholder), CTA Đăng ký/Đăng nhập, footer có link Sitemap (BẮT BUỘC theo SRS) và link Giới thiệu/Điều khoản/Quyền riêng tư.
- Trang /sitemap: sinh từ cấu hình route (không viết tay), nhóm Công khai / Sinh viên / Quản trị, mỗi mục có mô tả một dòng.
- Nhúng Tawk.to: component TawkWidget chỉ tải script sau khi trang đã render, ID lấy từ VITE_TAWK_PROPERTY_ID / VITE_TAWK_WIDGET_ID; không tải trong khu admin. Soạn sẵn 10 câu FAQ bằng tiếng Anh cho Tawk.to shortcuts (cách thêm giao dịch, nhập CSV, đặt ngân sách, AI dùng dữ liệu gì...).
- Toàn bộ nội dung trang bằng tiếng Anh; viết copy marketing ngắn gọn, giọng thân thiện với sinh viên.
- Onboarding 3 bước cho người dùng mới (nhập trợ cấp cơ sở, mục tiêu tiết kiệm, ghi giao dịch đầu tiên).
```

### P15.3 – Rà soát khả năng tiếp cận (WCAG 2.2 AA)

> 🔵 **Tầm trung agentic** – Phải quét và sửa nhiều file giao diện cùng lúc.

```text
[Dán Khối ngữ cảnh chung]
[Đính kèm: mục 8.5 Khả năng tiếp cận]

Rà toàn bộ thư mục web/src và sửa:
- Mọi ô nhập có <label> liên kết; lỗi form gắn aria-describedby và aria-invalid.
- Mọi nút chỉ có icon có aria-label; icon trang trí aria-hidden.
- Điều hướng bàn phím đủ: thứ tự tab hợp lý, focus hiển thị rõ, modal bẫy focus và trả focus khi đóng, có link "Skip to main content".
- Tương phản ≥ 4.5:1 ở cả light và dark.
- Biểu đồ có bảng dữ liệu thay thế; màu progress bar luôn kèm chữ.
- Thông báo toast dùng aria-live.
Liệt kê từng file đã sửa và lý do. Sau đó cho tôi checklist kiểm tra thủ công bằng bàn phím và Lighthouse cho 6 trang chính.
```

---

## GIAI ĐOẠN 16 – KIỂM THỬ VÀ RÀ SOÁT BẢO MẬT

### P16.1 – Bộ test theo test case tài liệu

> 🔵 **Tầm trung agentic** – Viết test tích hợp trải nhiều module, cần chạy được với MySQL thật.

```text
[Dán Khối ngữ cảnh chung]
[Đính kèm: mục 12.1, 12.2 (test case TC-01 → TC-12), 12.3 Dữ liệu kiểm thử]

1. Hạ tầng test api/tests: setup tạo DB test riêng (campus_coin_test), chạy migrate trước khi chạy suite, xóa dữ liệu giữa các test bằng TRUNCATE theo thứ tự khóa ngoại; factory tạo user/category/transaction; helper loginAs(role).
2. Viết test tích hợp cho TỪNG test case TC-01 → TC-12 trong mục 12.2, tên test ghi rõ mã TC.
3. Bổ sung bộ test "cross-tenant": với MỌI endpoint có :id của sinh viên (transactions, categories, budgets, recurring-rules, imports, bookmarks, tips, notifications), user B truy cập tài nguyên user A phải nhận 404.
4. Cấu hình vitest --coverage, xuất báo cáo html.
Cho tôi lệnh chạy và cách đọc báo cáo coverage.
```

### P16.2 – Kịch bản kiểm thử luồng thủ công

> 🟢 **Rẻ/nhanh** – Viết tài liệu kịch bản từ danh sách chức năng.

```text
[Đính kèm: Phụ lục A – Ma trận truy vết yêu cầu chức năng, mục 11.5 Tài khoản demo]

Viết docs/manual-test-scenarios.md: 15 kịch bản kiểm thử luồng (mỗi kịch bản: mã, mục tiêu, tài khoản dùng, các bước, kết quả mong đợi, cột Đạt/Không đạt, người kiểm, ngày). Phủ đủ mọi yêu cầu chức năng SRS: đăng ký/xác minh/đăng nhập/quên mật khẩu, admin login riêng, hồ sơ, danh mục, thêm nhanh, định kỳ, sửa/xóa/khôi phục có lịch sử, nhập CSV có gợi ý AI, dashboard, 3 loại báo cáo + lọc + xuất PDF/PNG + email, nhận định AI, mẹo pin/dismiss, ngân sách + cảnh báo, bookmark, quản trị, bất thường/trùng lặp/dự báo, dark mode/cỡ chữ/breadcrumbs, sitemap, chatbot. Ghi rõ kiểm tra trên Chrome, Firefox, Edge và điện thoại.
```

### P16.3 – Rà soát bảo mật toàn diện 🔴

> 🔴 **Cao cấp/suy luận** – Cần tư duy như kẻ tấn công trên toàn bộ codebase; mô hình rẻ thường bỏ sót lỗi logic phân quyền.

```text
[Dán Khối ngữ cảnh chung]
[Đính kèm: chương 9 Bảo mật; cho AI truy cập toàn bộ thư mục api/src và web/src]

Bạn là chuyên gia kiểm thử xâm nhập. Rà soát TOÀN BỘ mã nguồn theo OWASP Top 10 (2021) và OWASP API Security Top 10 (2023). Đặc biệt kiểm tra:
1. Mọi truy vấn Prisma/$queryRaw có lọc userId không; có chỗ nào nhận userId, role, status từ client không (mass assignment).
2. $queryRaw có chỗ nào nối chuỗi thay vì tham số hóa không.
3. Luồng refresh token, reset mật khẩu, xác minh email: có thể dùng lại token, đoán token, hay khóa tài khoản người khác không.
4. XSS: có dangerouslySetInnerHTML hay render HTML từ tip template/announcement/nhận định LLM không.
5. Nhập CSV: CSV injection, file lớn, zip bomb đổi đuôi, ký tự điều khiển.
6. Prompt injection qua mô tả giao dịch tới LLM; PII có lọt ra ngoài không.
7. Rate limit có bị bỏ qua bằng cách đổi header (X-Forwarded-For) không – kiểm tra cấu hình trust proxy.
8. Header bảo mật, CORS, cookie flags, thông báo lỗi có lộ stack/thông tin nội bộ không.
9. Secrets có bị commit hoặc log không.
KHÔNG sửa code. Trả về bảng: Mức độ (Critical/High/Medium/Low) | Vị trí (file:dòng) | Mô tả | Cách khai thác | Cách sửa đề xuất. Sắp xếp theo mức độ.
```

### P16.4 – Sửa lỗi bảo mật theo báo cáo 🔵

> 🔵 **Tầm trung agentic** – Sửa theo danh sách đã được phân tích sẵn, có thể chạm nhiều file.

```text
[Dán Khối ngữ cảnh chung]
[Dán bảng kết quả P16.3 – chỉ giữ các dòng đội đã đồng ý sửa]

Sửa lần lượt từng lỗi trong bảng, theo thứ tự mức độ. Với mỗi lỗi: (1) sửa code, (2) viết thêm một test tái hiện lỗi và chứng minh đã được sửa, (3) ghi một dòng tóm tắt. Không thay đổi hành vi khác ngoài phạm vi lỗi.
```

---

## GIAI ĐOẠN 17 – ĐÓNG GÓI VÀ TRIỂN KHAI

### P17.1 – Dockerfile và Docker Compose production

> 🔵 **Tầm trung agentic** – Nhiều file hạ tầng phải khớp nhau (2 Dockerfile, Nginx, Compose, healthcheck).

```text
[Dán Khối ngữ cảnh chung]
[Đính kèm: mục 4.4 Kiến trúc triển khai (bảng container), 11.4.2, 9.11]

Tạo:
1. api/Dockerfile multi-stage (node:24-alpine): build TypeScript + prisma generate; image cuối chỉ có dist, node_modules production, prisma; chạy user node; HEALTHCHECK gọi /api/v1/health/live.
2. web/Dockerfile multi-stage: build Vite → nginx:alpine phục vụ /usr/share/nginx/html.
3. web/nginx.conf: SPA fallback về index.html; proxy /api/ tới http://api:3000 (đặt X-Forwarded-For, X-Real-IP); gzip; cache dài hạn cho file có hash, no-cache cho index.html; giới hạn body 2 MB; limit_req 20 r/s burst 40; header bảo mật (HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy); server 443 dùng chứng chỉ Let's Encrypt mount từ /etc/letsencrypt.
4. docker-compose.yml production: web (cổng 80/443), api (restart unless-stopped, ENABLE_CRON=true, không mở cổng ra ngoài), mysql (volume, không mở cổng, healthcheck); api depends_on mysql healthy; mạng nội bộ.
5. Cấu hình Express trust proxy đúng 1 hop để rate limit đọc đúng IP.
6. Script scripts/backup.sh: mysqldump --single-transaction, nén gzip, giữ 7 bản gần nhất; kèm dòng crontab 02:00.
Giải thích từng quyết định bảo mật trong Dockerfile.
```

### P17.2 – Pipeline GitHub Actions

> 🟢 **Rẻ/nhanh** – YAML theo quy trình đã chốt (Hình 28).

```text
[Dán Khối ngữ cảnh chung]
[Đính kèm: mục 11.2 Pipeline CI/CD, Hình 28]

Tạo .github/workflows/ci.yml (chạy mỗi PR và push): npm ci → lint → typecheck → test (service container mysql:8.4, chạy migrate) → npm audit --audit-level=high (fail nếu có High).
Tạo .github/workflows/deploy.yml (khi push main, sau khi CI xanh): build 2 image, đẩy lên GHCR (tag = git SHA); SSH vào VPS (secrets: VPS_HOST, VPS_USER, VPS_SSH_KEY): chạy scripts/backup.sh → docker compose pull → docker compose run --rm api npx prisma migrate deploy → docker compose up -d → smoke test curl /api/v1/health/ready (thử 10 lần, cách 3 giây); thất bại thì quay về tag image trước và báo lỗi.
Thêm .github/dependabot.yml cho npm (hằng tuần).
```

### P17.3 – Checklist dựng VPS lần đầu

> 🟢 **Rẻ/nhanh** – Tài liệu vận hành theo các bước tiêu chuẩn.

```text
[Đính kèm: mục 11.4.4 Triển khai production]

Viết docs/deploy-vps.md: các lệnh tuần tự trên Ubuntu 24.04 để: tạo user deploy, tắt đăng nhập root và mật khẩu SSH, bật UFW (22, 80, 443), cài Docker Engine + Compose v2, trỏ DNS, lấy chứng chỉ Let's Encrypt bằng certbot (standalone lần đầu, sau đó tự gia hạn và reload nginx), tạo file .env production (liệt kê biến, KHÔNG điền giá trị), chạy lần đầu (migrate + seed base + seed demo), cài crontab backup, đăng ký UptimeRobot cho /api/v1/health/ready. Mỗi bước có lệnh kiểm tra đã thành công.
```

---

## GIAI ĐOẠN 18 – GÓI NỘP BÀI THEO SRS 1.9

### P18.1 – Dữ liệu demo 6 tháng

> 🔵 **Tầm trung agentic** – Dữ liệu phải "kể được câu chuyện" để kích hoạt đủ tính năng khi demo (cảnh báo, mẹo, bất thường, nhận định).

```text
[Dán Khối ngữ cảnh chung]
[Đính kèm: mục 11.5 Tài khoản demo, 12.3 Dữ liệu kiểm thử, 5.9.1, 5.10, 5.14]

Viết api/prisma/seed/demo.ts (chỉ chạy khi SEED_DEMO=true) tạo các tài khoản theo mục 11.5 và dữ liệu có chủ đích:
- Sinh viên 1 (AI bật): 6 tháng giao dịch thực tế (trợ cấp định kỳ đầu tháng, cơm/cafe hằng ngày, xe buýt, phòng trọ, sách đầu kỳ, Netflix + Spotify + 2 gói khác), THÁNG TRƯỚC Food delivery tăng ~40% để nhận định có nội dung; tháng này Food đã 85% ngân sách (cảnh báo NEAR_LIMIT), 9 khoản đồ uống nhỏ trong 7 ngày (kích hoạt R3), 1 khoản chi lớn bất thường, 1 cặp giao dịch nghi trùng; có sẵn nhận định 3 tháng gần nhất; 2 tip đã pin, 1 bookmark.
- Sinh viên 2 (AI tắt): 3 tháng, có giao dịch định kỳ.
- Sinh viên 3: tài khoản mới để demo onboarding và nhập CSV (kèm file demo/import-sample.csv 40 dòng, có 2 dòng lỗi và 3 dòng trùng).
- Tài khoản bị vô hiệu hóa.
Mọi mô tả giao dịch, tên danh mục cá nhân, ghi chú, nhận định và tip bằng tiếng Anh (vd. "Campus Cafe latte", "Bus pass", "Dorm rent"); tên người dùng demo có thể là tên Việt (Nguyen Van An) để minh họa dữ liệu có dấu.
Dữ liệu sinh bằng seed ngẫu nhiên CỐ ĐỊNH (seeded RNG) để lần nào chạy cũng giống nhau. Ngày tính tương đối so với ngày chạy seed.
Sau đó thêm script xuất /database/seed.sql bằng mysqldump --no-create-info.
```

### P18.2 – README và hướng dẫn cài đặt

> 🟢 **Rẻ/nhanh** – Tổng hợp từ nội dung đã có.

```text
[Đính kèm: mục 11.4 Hướng dẫn cài đặt, 11.5 Tài khoản demo, 1.6 Giả định]

Viết README.md cho repo bằng tiếng Anh gồm: giới thiệu, ảnh chụp màn hình, tính năng theo nhóm SRS, stack, cài đặt bằng Docker, cài đặt thủ công, biến môi trường, tài khoản demo (bảng), URL bản trực tuyến, chạy test, cấu trúc thư mục, giả định, khai báo công cụ AI (trỏ tới docs/ai-usage-log.md), giấy phép.
Viết thêm nội dung cho file ReadMe.doc theo SRS: danh sách giả định (lấy từ bảng 1.6), hướng dẫn cài đặt rút gọn, thông tin đăng nhập mọi loại người dùng. Viết bằng tiếng Anh, xuất dạng Markdown để tôi dán vào Word.
```

### P18.3 – Kịch bản video demo

> 🟢 **Rẻ/nhanh** – Viết kịch bản theo danh sách chức năng.

```text
[Đính kèm: Phụ lục A – Ma trận truy vết chức năng; SRS mục 1.9]

SRS yêu cầu video .mp4 trình diễn TẤT CẢ chức năng trong Functional Requirements. Viết kịch bản video 8–10 phút dạng bảng: Thời điểm | Màn hình/Thao tác | Lời thoại (tiếng Anh, ngắn) | Yêu cầu SRS được chứng minh. Thứ tự hợp lý: trang chủ + sitemap → đăng ký/xác minh → onboarding → thêm nhanh có gợi ý AI → định kỳ → nhập CSV → dashboard → báo cáo + lọc + xuất PDF/PNG + email → ngân sách + cảnh báo → nhận định AI → mẹo → bất thường/trùng lặp/dự báo → bookmark → sửa/xóa/khôi phục + lịch sử → dark mode/cỡ chữ/breadcrumbs → chatbot → quên mật khẩu → đăng nhập admin + các chức năng quản trị. Cuối kịch bản có checklist để đánh dấu không bỏ sót yêu cầu nào.
```

### P18.4 – Tổng hợp khai báo AI để nộp

> 🟢 **Rẻ/nhanh** – Tóm tắt từ nhật ký có sẵn.

```text
[Dán nội dung docs/ai-usage-log.md]

Tổng hợp nhật ký thành bảng khai báo cho tài liệu nộp (Phụ lục D): Công cụ AI | Mục đích sử dụng | Phạm vi / Mức độ | Người kiểm duyệt. Gộp theo công cụ, viết trung thực, không phóng đại hay giảm nhẹ. Thêm một đoạn cam kết: đội hiểu, đã chỉnh sửa và giải thích được toàn bộ mã nguồn.
```

---

## PHỤ LỤC R – PROMPT DÙNG LẠI NHIỀU LẦN

### R-1 – Rà soát code trước khi merge

> 🔵 **Tầm trung agentic** – Đọc diff nhiều file và đối chiếu quy ước. Nâng lên 🔴 nếu diff chạm auth, phân quyền hoặc tiền.

```text
[Dán Khối ngữ cảnh chung]
[Dán diff của Pull Request hoặc chỉ định nhánh]

Rà soát diff này như một reviewer khó tính. Kiểm tra: đúng quy ước trong CLAUDE.md; lọc userId; validate Zod; xử lý lỗi Problem Details; số tiền dùng Decimal/chuỗi; timezone; test có đủ trường hợp thành công + bị từ chối; không có any, console.log, secret; chuỗi giao diện tiếng Anh đã nằm trong web/src/content/en.ts.
Trả về: danh sách vấn đề theo mức độ (Phải sửa / Nên sửa / Góp ý), mỗi vấn đề có file:dòng và đề xuất cụ thể. KHÔNG tự sửa.
```

### R-2 – Giải thích để bảo vệ trước giám khảo

> 🔴 **Cao cấp/suy luận** – Cần giải thích sâu "vì sao", so sánh phương án và lường trước câu hỏi khó; đây là thứ quyết định điểm vấn đáp.

```text
[Dán đoạn code hoặc chỉ định module]

Tôi phải trình bày và bảo vệ phần này trước giám khảo Techwiz. Hãy:
1. Giải thích luồng hoạt động bằng lời đơn giản, theo từng bước.
2. Giải thích vì sao chọn cách làm này thay vì 2 phương án khác (nêu cụ thể phương án khác là gì).
3. Liệt kê 8 câu hỏi khó giám khảo có thể hỏi về phần này (bảo mật, hiệu năng, ca biên, vì sao không dùng X) kèm gợi ý trả lời ngắn.
4. Chỉ ra 2–3 điểm yếu thật sự của cách làm hiện tại và cách cải thiện nếu có thêm thời gian.
Không khen chung chung; viết như một người hướng dẫn kỹ thuật.
```

### R-3 – Gỡ lỗi có hệ thống

> 🔵 **Tầm trung agentic** – Cần đọc log, code liên quan và chạy thử giả thuyết. Nâng lên 🔴 nếu lỗi liên quan dữ liệu sai lệch hoặc chỉ xảy ra ngẫu nhiên.

```text
[Dán Khối ngữ cảnh chung]

Lỗi: [mô tả hiện tượng]
Kỳ vọng: [...]
Thực tế: [...]
Cách tái hiện: [...]
Log / stack trace / response: [dán]
Đã thử: [...]

Hãy: (1) liệt kê tối đa 3 giả thuyết nguyên nhân xếp theo khả năng; (2) với giả thuyết đầu tiên, chỉ ra cách kiểm chứng (lệnh, log cần thêm, test cần viết); (3) chỉ đề xuất sửa sau khi đã xác định nguyên nhân, kèm test chống tái phát. Không sửa đoán mò nhiều chỗ cùng lúc.
```

### R-4 – Viết test cho code có sẵn

> 🟢 **Rẻ/nhanh** – Viết test theo mẫu cho hàm đã rõ hành vi.

```text
[Dán hàm/module]

Viết unit test Vitest cho đoạn code này: phủ trường hợp chuẩn, trường hợp biên (0, rỗng, null, giá trị lớn nhất, ngày cuối tháng, năm nhuận, múi giờ), và trường hợp lỗi. Mỗi test có tên mô tả hành vi bằng tiếng Anh ("returns ... when ..."). Không mock những gì không cần mock.
```

### R-5 – Tối ưu truy vấn chậm

> 🔴 **Cao cấp/suy luận** – Đọc kế hoạch thực thi và chọn chỉ mục đúng cần suy luận; chỉ mục sai làm chậm ghi.

```text
[Dán câu truy vấn, kết quả EXPLAIN ANALYZE, số lượng bản ghi các bảng liên quan, danh sách chỉ mục hiện có]

Phân tích vì sao truy vấn chậm. Đề xuất: viết lại truy vấn và/hoặc chỉ mục mới (kèm thứ tự cột và lý do). Ước lượng ảnh hưởng tới tốc độ ghi. Nếu thêm chỉ mục, viết migration tương ứng.
```

---

## PHỤ LỤC S – LỊCH TRÌNH GỢI Ý (4 SPRINT × 1 TUẦN)

| Sprint | Giai đoạn trong bộ kit | Kết quả cuối sprint |
|---|---|---|
| 1 – Nền tảng | 0, 1, 2, 3, 4 | Đăng ký, xác minh, đăng nhập, reset, hồ sơ, danh mục chạy được; CI xanh |
| 2 – Nghiệp vụ lõi | 5, 6, 7, 8 (P8.1, P8.2) | Ghi/sửa/xóa giao dịch có lịch sử, định kỳ, ngân sách + cảnh báo, dashboard, báo cáo |
| 3 – Báo cáo & AI | 8 (P8.3), 9, 10, 11, 12 | PDF + email, phân loại AI, nhập CSV, nhận định, mẹo |
| 4 – Hoàn thiện | 13, 14, 15, 16, 17, 18 | Trí tuệ hệ thống, admin, giao diện/truy cập, bảo mật, triển khai, gói nộp |

**Mẹo tiết kiệm chi phí AI:** các bước 🔴 chỉ chạy một lần mỗi quyết định và lưu kết quả vào `docs/decisions/`. Khi thi công nhiều lần ở bước B, chỉ cần dán lại ADR chứ không cần chạy lại mô hình đắt.

**Mẹo làm việc nhóm:** chia theo cột dọc (một người làm trọn một tính năng từ DB tới UI) thay vì chia FE/BE, để mỗi người tự giải thích được trọn luồng của mình khi giám khảo hỏi.

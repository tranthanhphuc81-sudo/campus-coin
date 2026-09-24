---
description: "🔵 P1.4 – Khung Express, middleware pipeline, lỗi chuẩn RFC 9457"
model: sonnet
---
# P1.4 – Khung Express, middleware pipeline, lỗi chuẩn RFC 9457

> **Cấp AI: 🔵 Tầm trung agentic** – Nhiều file phụ thuộc thứ tự (app, middleware, error handler, logger) và là xương sống cho mọi module sau.

Tuân thủ toàn bộ quy tắc trong AGENTS.md (đã được nạp tự động).

## Tài liệu tham chiếu (đọc trước khi làm)

- @docs/design/04-kien-truc-he-thong.md
- @docs/design/07-thiet-ke-api.md
- @docs/design/09-bao-mat.md

Tập trung vào: mục 4.2 Kiến trúc Backend, 7.1 Quy ước API, 7.2 Định dạng lỗi chuẩn, 9.11 Header bảo mật.

## Nhiệm vụ

Tạo khung backend:
1. api/src/app.ts: tạo Express app, gắn middleware theo THỨ TỰ: requestId (sinh UUID, đặt header X-Request-Id) → pino-http (redact: password, token, authorization, cookie) → helmet (CSP cho phép domain Tawk.to) → cors (allowlist từ config, credentials: true) → express.json({limit: '100kb'}) → cookie-parser → rate limit toàn cục (300 req/phút theo userId nếu có, ngược lại theo IP) → router /api/v1 → notFound → errorHandler.
2. api/src/lib/problem.ts: class AppError(status, type, title, detail?, errors?) và các helper: badRequest, unauthenticated, forbidden, notFound, conflict, versionMismatch, validationFailed(errors), rateLimited, payloadTooLarge.
3. api/src/middlewares/errorHandler.ts: chuyển AppError, ZodError (→ 422 kèm errors[] theo field), lỗi Prisma P2002 (→ 409), P2025 (→ 404) và lỗi khác (→ 500, không lộ stack ở production) thành Problem Details.
4. api/src/middlewares/validate.ts: validate({body?, query?, params?}) dùng Zod, gán dữ liệu đã parse vào req.
5. api/src/server.ts: khởi động, graceful shutdown (SIGTERM/SIGINT: ngừng nhận request, chờ tối đa 10 giây, đóng Prisma).
6. Route GET /api/v1/health/live và /health/ready (ready kiểm tra DB bằng SELECT 1).
Express 5 tự bắt lỗi async – không cần wrapper asyncHandler. Viết 3 test Supertest: health live, route không tồn tại trả 404 Problem Details, body sai JSON trả 400.

## Kết thúc

In: (1) giả định đã đặt, (2) chỗ đội cần tự kiểm tra, (3) lệnh để chạy/kiểm thử, (4) một dòng đề xuất cho docs/ai-usage-log.md.

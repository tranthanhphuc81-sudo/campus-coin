---
name: p1-3-env-config
description: "🟢 P1.3 – Nạp và kiểm tra biến môi trường (fail fast)"
agent: agent
---
# P1.3 – Nạp và kiểm tra biến môi trường (fail fast)

> **Cấp AI: 🟢 Rẻ/nhanh** – Mẫu quen thuộc: parse process.env bằng Zod.

Tuân thủ toàn bộ quy tắc trong AGENTS.md (đã được nạp tự động).

## Tài liệu tham chiếu (đọc trước khi làm)

- [docs/design/11-trien-khai-van-hanh.md](../../docs/design/11-trien-khai-van-hanh.md)

Tập trung vào: mục 11.3 Cấu hình môi trường.

## Nhiệm vụ

Tạo api/src/config/env.ts:
- Dùng Zod parse process.env (dotenv khi dev). Thiếu biến bắt buộc → in danh sách biến lỗi và process.exit(1).
- Nhóm biến: APP (NODE_ENV, PORT, APP_URL, CORS_ORIGINS dạng danh sách phân tách dấu phẩy), DATABASE_URL, JWT (JWT_PRIVATE_KEY, JWT_PUBLIC_KEY dạng PEM, JWT_KID, ACCESS_TOKEN_TTL mặc định 900 giây, REFRESH_TOKEN_TTL mặc định 30 ngày), IP_HASH_SECRET, SMTP_*, MAIL_FROM, AI_PROVIDER (gemini|openai|none), AI_API_KEY (tùy chọn), AI_MODEL, AI_TIMEOUT_MS mặc định 3000, AI_DAILY_QUOTA mặc định 200, SENTRY_DSN (tùy chọn).
- Export object config đã được type.
- Thêm script "keys:generate" sinh cặp khóa EdDSA (Ed25519) bằng jose, in ra dạng PEM để dán vào .env.

## Kết thúc

In: (1) giả định đã đặt, (2) chỗ đội cần tự kiểm tra, (3) lệnh để chạy/kiểm thử, (4) một dòng đề xuất cho docs/ai-usage-log.md.

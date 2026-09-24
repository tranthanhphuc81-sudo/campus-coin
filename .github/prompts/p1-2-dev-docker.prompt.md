---
name: p1-2-dev-docker
description: "🟢 P1.2 – Docker Compose cho môi trường dev"
agent: agent
---
# P1.2 – Docker Compose cho môi trường dev

> **Cấp AI: 🟢 Rẻ/nhanh** – Cấu hình Compose chuẩn, ít rủi ro.

Tuân thủ toàn bộ quy tắc trong AGENTS.md (đã được nạp tự động).

## Nhiệm vụ

Tạo docker-compose.dev.yml cho môi trường phát triển:
- mysql:8.4 với volume dữ liệu, charset utf8mb4 / collation utf8mb4_0900_ai_ci, healthcheck bằng mysqladmin ping, cổng 3306 chỉ bind 127.0.0.1.
- mailpit (axllent/mailpit) để bắt email khi dev: SMTP 1025, UI 8025.
- Không chứa api/web (dev chạy trực tiếp bằng npm run dev).
Thêm vào .env.example các biến: DATABASE_URL, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM.
Viết thêm script npm "db:up" và "db:down" ở package.json gốc.

## Kết thúc

In: (1) giả định đã đặt, (2) chỗ đội cần tự kiểm tra, (3) lệnh để chạy/kiểm thử, (4) một dòng đề xuất cho docs/ai-usage-log.md.

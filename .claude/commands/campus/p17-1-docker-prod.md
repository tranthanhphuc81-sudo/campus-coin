---
description: "🔵 P17.1 – Dockerfile và Docker Compose production"
model: sonnet
---
# P17.1 – Dockerfile và Docker Compose production

> **Cấp AI: 🔵 Tầm trung agentic** – Nhiều file hạ tầng phải khớp nhau (2 Dockerfile, Nginx, Compose, healthcheck).

Tuân thủ toàn bộ quy tắc trong AGENTS.md (đã được nạp tự động).

## Tài liệu tham chiếu (đọc trước khi làm)

- @docs/design/04-kien-truc-he-thong.md
- @docs/design/09-bao-mat.md
- @docs/design/11-trien-khai-van-hanh.md

Tập trung vào: mục 4.4 Kiến trúc triển khai (bảng container), 11.4.2, 9.11.

## Nhiệm vụ

Tạo:
1. api/Dockerfile multi-stage (node:24-alpine): build TypeScript + prisma generate; image cuối chỉ có dist, node_modules production, prisma; chạy user node; HEALTHCHECK gọi /api/v1/health/live.
2. web/Dockerfile multi-stage: build Vite → nginx:alpine phục vụ /usr/share/nginx/html.
3. web/nginx.conf: SPA fallback về index.html; proxy /api/ tới http://api:3000 (đặt X-Forwarded-For, X-Real-IP); gzip; cache dài hạn cho file có hash, no-cache cho index.html; giới hạn body 2 MB; limit_req 20 r/s burst 40; header bảo mật (HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy); server 443 dùng chứng chỉ Let's Encrypt mount từ /etc/letsencrypt.
4. docker-compose.yml production: web (cổng 80/443), api (restart unless-stopped, ENABLE_CRON=true, không mở cổng ra ngoài), mysql (volume, không mở cổng, healthcheck); api depends_on mysql healthy; mạng nội bộ.
5. Cấu hình Express trust proxy đúng 1 hop để rate limit đọc đúng IP.
6. Script scripts/backup.sh: mysqldump --single-transaction, nén gzip, giữ 7 bản gần nhất; kèm dòng crontab 02:00.
Giải thích từng quyết định bảo mật trong Dockerfile.

## Kết thúc

In: (1) giả định đã đặt, (2) chỗ đội cần tự kiểm tra, (3) lệnh để chạy/kiểm thử, (4) một dòng đề xuất cho docs/ai-usage-log.md.

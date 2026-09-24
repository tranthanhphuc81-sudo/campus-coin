---
description: "🟢 P17.2 – Pipeline GitHub Actions"
model: haiku
---
# P17.2 – Pipeline GitHub Actions

> **Cấp AI: 🟢 Rẻ/nhanh** – YAML theo quy trình đã chốt (Hình 28).

Tuân thủ toàn bộ quy tắc trong AGENTS.md (đã được nạp tự động).

## Tài liệu tham chiếu (đọc trước khi làm)

- @docs/design/11-trien-khai-van-hanh.md

Tập trung vào: mục 11.2 Pipeline CI/CD, Hình 28.

## Nhiệm vụ

Tạo .github/workflows/ci.yml (chạy mỗi PR và push): npm ci → lint → typecheck → test (service container mysql:8.4, chạy migrate) → npm audit --audit-level=high (fail nếu có High).
Tạo .github/workflows/deploy.yml (khi push main, sau khi CI xanh): build 2 image, đẩy lên GHCR (tag = git SHA); SSH vào VPS (secrets: VPS_HOST, VPS_USER, VPS_SSH_KEY): chạy scripts/backup.sh → docker compose pull → docker compose run --rm api npx prisma migrate deploy → docker compose up -d → smoke test curl /api/v1/health/ready (thử 10 lần, cách 3 giây); thất bại thì quay về tag image trước và báo lỗi.
Thêm .github/dependabot.yml cho npm (hằng tuần).

## Kết thúc

In: (1) giả định đã đặt, (2) chỗ đội cần tự kiểm tra, (3) lệnh để chạy/kiểm thử, (4) một dòng đề xuất cho docs/ai-usage-log.md.

---
description: "🟢 P17.3 – Checklist dựng VPS lần đầu"
model: haiku
---
# P17.3 – Checklist dựng VPS lần đầu

> **Cấp AI: 🟢 Rẻ/nhanh** – Tài liệu vận hành theo các bước tiêu chuẩn.

Tuân thủ toàn bộ quy tắc trong AGENTS.md (đã được nạp tự động).

## Tài liệu tham chiếu (đọc trước khi làm)

- @docs/design/11-trien-khai-van-hanh.md

Tập trung vào: mục 11.4.4 Triển khai production.

## Nhiệm vụ

Viết docs/deploy-vps.md: các lệnh tuần tự trên Ubuntu 24.04 để: tạo user deploy, tắt đăng nhập root và mật khẩu SSH, bật UFW (22, 80, 443), cài Docker Engine + Compose v2, trỏ DNS, lấy chứng chỉ Let's Encrypt bằng certbot (standalone lần đầu, sau đó tự gia hạn và reload nginx), tạo file .env production (liệt kê biến, KHÔNG điền giá trị), chạy lần đầu (migrate + seed base + seed demo), cài crontab backup, đăng ký UptimeRobot cho /api/v1/health/ready. Mỗi bước có lệnh kiểm tra đã thành công.

## Kết thúc

In: (1) giả định đã đặt, (2) chỗ đội cần tự kiểm tra, (3) lệnh để chạy/kiểm thử, (4) một dòng đề xuất cho docs/ai-usage-log.md.

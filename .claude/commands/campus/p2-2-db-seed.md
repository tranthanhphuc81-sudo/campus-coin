---
description: "🟢 P2.2 – Seed dữ liệu khởi tạo"
model: haiku
---
# P2.2 – Seed dữ liệu khởi tạo

> **Cấp AI: 🟢 Rẻ/nhanh** – Dữ liệu tĩnh theo danh sách có sẵn.

Tuân thủ toàn bộ quy tắc trong AGENTS.md (đã được nạp tự động).

## Tài liệu tham chiếu (đọc trước khi làm)

- @docs/design/05-thiet-ke-chuc-nang.md
- @docs/design/06-thiet-ke-co-so-du-lieu.md

Tập trung vào: mục 6.5 Dữ liệu khởi tạo, mục 5.3 Danh mục, mục 5.10 Bảng quy tắc mẹo.

## Nhiệm vụ

Viết api/prisma/seed/base.ts (idempotent – chạy lại không tạo trùng, dùng upsert):
- Danh mục mặc định theo SRS. Thu: Allowance, Part-time Job, Scholarship, Gift, Other Income. Chi: Food, Transport, Hostel/Rent, Academics, Subscriptions, Entertainment, Miscellaneous. Mỗi danh mục có icon (tên Bootstrap Icons), màu HEX, sort_order.
- tip_templates cho các quy tắc R0–R6 bằng tiếng Anh (locale = 'en'), dùng biến {category}, {amount}, {percent}, {count}.
- 1 tài khoản admin lấy email/mật khẩu từ biến môi trường SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD (băm argon2id).
- Từ điển ~300 từ khóa phân loại tiếng Anh (cafe, coffee, lunch, canteen, pizza, grab, uber, bus, metro, rent, dorm, netflix, spotify, textbook, tuition, stationery, cinema, ...) lưu ở api/src/modules/ai/keywords.ts dạng Map<keyword, categoryName> – file riêng, không đưa vào DB.
Script: npm run db:seed.

## Kết thúc

In: (1) giả định đã đặt, (2) chỗ đội cần tự kiểm tra, (3) lệnh để chạy/kiểm thử, (4) một dòng đề xuất cho docs/ai-usage-log.md.

---
name: p18-1-demo-seed
description: "🔵 P18.1 – Dữ liệu demo 6 tháng"
agent: agent
---
# P18.1 – Dữ liệu demo 6 tháng

> **Cấp AI: 🔵 Tầm trung agentic** – Dữ liệu phải "kể được câu chuyện" để kích hoạt đủ tính năng khi demo (cảnh báo, mẹo, bất thường, nhận định).

Tuân thủ toàn bộ quy tắc trong AGENTS.md (đã được nạp tự động).

## Tài liệu tham chiếu (đọc trước khi làm)

- [docs/design/05-thiet-ke-chuc-nang.md](../../docs/design/05-thiet-ke-chuc-nang.md)
- [docs/design/11-trien-khai-van-hanh.md](../../docs/design/11-trien-khai-van-hanh.md)
- [docs/design/12-chien-luoc-kiem-thu.md](../../docs/design/12-chien-luoc-kiem-thu.md)

Tập trung vào: mục 11.5 Tài khoản demo, 12.3 Dữ liệu kiểm thử, 5.9.1, 5.10, 5.14.

## Nhiệm vụ

Viết api/prisma/seed/demo.ts (chỉ chạy khi SEED_DEMO=true) tạo các tài khoản theo mục 11.5 và dữ liệu có chủ đích:
- Sinh viên 1 (AI bật): 6 tháng giao dịch thực tế (trợ cấp định kỳ đầu tháng, cơm/cafe hằng ngày, xe buýt, phòng trọ, sách đầu kỳ, Netflix + Spotify + 2 gói khác), THÁNG TRƯỚC Food delivery tăng ~40% để nhận định có nội dung; tháng này Food đã 85% ngân sách (cảnh báo NEAR_LIMIT), 9 khoản đồ uống nhỏ trong 7 ngày (kích hoạt R3), 1 khoản chi lớn bất thường, 1 cặp giao dịch nghi trùng; có sẵn nhận định 3 tháng gần nhất; 2 tip đã pin, 1 bookmark.
- Sinh viên 2 (AI tắt): 3 tháng, có giao dịch định kỳ.
- Sinh viên 3: tài khoản mới để demo onboarding và nhập CSV (kèm file demo/import-sample.csv 40 dòng, có 2 dòng lỗi và 3 dòng trùng).
- Tài khoản bị vô hiệu hóa.
Mọi mô tả giao dịch, tên danh mục cá nhân, ghi chú, nhận định và tip bằng tiếng Anh (vd. "Campus Cafe latte", "Bus pass", "Dorm rent"); tên người dùng demo có thể là tên Việt (Nguyen Van An) để minh họa dữ liệu có dấu.
Dữ liệu sinh bằng seed ngẫu nhiên CỐ ĐỊNH (seeded RNG) để lần nào chạy cũng giống nhau. Ngày tính tương đối so với ngày chạy seed.
Sau đó thêm script xuất /database/seed.sql bằng mysqldump --no-create-info.

## Kết thúc

In: (1) giả định đã đặt, (2) chỗ đội cần tự kiểm tra, (3) lệnh để chạy/kiểm thử, (4) một dòng đề xuất cho docs/ai-usage-log.md.

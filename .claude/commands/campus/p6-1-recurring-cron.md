---
description: "🔵 P6.1 – Lập lịch node-cron và sinh giao dịch định kỳ"
model: sonnet
---
# P6.1 – Lập lịch node-cron và sinh giao dịch định kỳ

> **Cấp AI: 🔵 Tầm trung agentic** – Có logic ngày tháng dễ sai (ngày 31, catch-up, múi giờ) và idempotency; nên để mô hình agentic viết kèm test đầy đủ.

Tuân thủ toàn bộ quy tắc trong AGENTS.md (đã được nạp tự động).

## Tài liệu tham chiếu (đọc trước khi làm)

- @docs/design/04-kien-truc-he-thong.md
- @docs/design/05-thiet-ke-chuc-nang.md
- @docs/design/06-thiet-ke-co-so-du-lieu.md

Tập trung vào: mục 4.5 (bảng tác vụ nền), 5.4.2, 6.3.5 (recurring_rules).

## Nhiệm vụ

1. api/src/jobs/scheduler.ts: đăng ký các job node-cron với timezone 'Asia/Ho_Chi_Minh', chỉ chạy khi ENABLE_CRON=true (để test không chạy cron). Mỗi job bọc try/catch, log thời gian chạy, không để lỗi làm sập process. Có cờ chống chạy chồng (nếu lượt trước chưa xong thì bỏ qua lượt này).
2. api/src/jobs/recurring.ts – chạy 00:05 hằng ngày: lấy recurring_rules is_active với next_run_date ≤ hôm nay; với mỗi quy tắc sinh giao dịch source='recurring' cho TỪNG kỳ đến hạn (catch-up tối đa 12 kỳ), recurring_period dạng '2026-09' (tháng) / '2026-W38' (tuần) / '2026' (năm); dựa vào UNIQUE(recurring_rule_id, recurring_period) để không bao giờ sinh trùng (bắt lỗi P2002 và bỏ qua). Ngày 29–31 ở tháng thiếu ngày → ngày cuối tháng. Vượt end_date → is_active=false. Phát sự kiện transaction.created cho mỗi giao dịch sinh ra.
3. api/src/jobs/cleanup.ts – 03:00 hằng ngày: xóa token hết hạn > 7 ngày, bản nháp import > 24 giờ, idempotency_keys > 24 giờ, giao dịch xóa mềm > 30 ngày (ẩn danh hóa lịch sử), tài khoản yêu cầu xóa > 30 ngày.
4. Module api/src/modules/recurring-rules: GET/POST/PATCH/DELETE /recurring-rules (sửa chỉ áp dụng kỳ tương lai; tạm dừng/tiếp tục).
5. Hàm thuần computeNextRunDate(rule, fromDate) tách riêng để unit test.
Unit test: quy tắc ngày 31 qua tháng 2 (năm nhuận và không nhuận); chạy job 2 lần cùng ngày không sinh trùng; hệ thống ngừng 3 tháng → catch-up đủ 3 kỳ; weekly interval 2.

## Kết thúc

In: (1) giả định đã đặt, (2) chỗ đội cần tự kiểm tra, (3) lệnh để chạy/kiểm thử, (4) một dòng đề xuất cho docs/ai-usage-log.md.

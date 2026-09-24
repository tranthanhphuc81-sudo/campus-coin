---
description: "🔵 P5.1-B – Hiện thực module giao dịch backend"
model: sonnet
---
# P5.1-B – Hiện thực module giao dịch backend

> **Cấp AI: 🔵 Tầm trung agentic** – Module lớn nhất của nghiệp vụ lõi, nhiều endpoint và test.

Tuân thủ toàn bộ quy tắc trong AGENTS.md (đã được nạp tự động).

## Tài liệu tham chiếu (đọc trước khi làm)

- @docs/design/05-thiet-ke-chuc-nang.md
- @docs/design/07-thiet-ke-api.md
- @docs/decisions/ADR-TX-01.md

Tập trung vào: ADR-TX-01, mục 5.4, 7.3.2 (transactions).

**Điều kiện tiên quyết:** các file `docs/decisions/ADR-TX-01.md` phải tồn tại và có trạng thái `Accepted`. Nếu chưa, DỪNG và nhắc người dùng chạy prompt bước A tương ứng.

## Nhiệm vụ

Hiện thực api/src/modules/transactions và api/src/events theo ADR-TX-01:
- GET /transactions (lọc from, to, type, categoryId nhiều giá trị, q, minAmount, maxAmount, sort; phân trang page/limit ≤ 100, trả meta).
- GET /transactions/:id (ghi recent_activity 'viewed', giữ 20 bản ghi/người).
- POST /transactions (Idempotency-Key, tùy chọn recurring: tạo recurring_rule kèm).
- PATCH /transactions/:id (yêu cầu version; ghi recent_activity 'edited').
- DELETE /transactions/:id (xóa mềm), POST /transactions/:id/restore (trong 30 ngày), GET /transactions/:id/history, GET /transactions/trash.
- Validate BR-TX-01..04: số tiền > 0, tối đa 2 chữ số thập phân (VND: 0), ngày trong khoảng cho phép theo timezone người dùng, danh mục cùng loại và thuộc người dùng hoặc mặc định.
- Event bus api/src/events/bus.ts + đăng ký handler rỗng (BudgetAlert, Anomaly, AiLearning sẽ làm ở giai đoạn sau).
Test bắt buộc: người A không đọc/sửa/xóa được giao dịch người B (404); sửa với version cũ → 409; gửi lặp cùng Idempotency-Key không tạo 2 giao dịch; xóa rồi khôi phục có đủ 3 dòng lịch sử; ngày tương lai quá 1 ngày → 422.

## Kết thúc

In: (1) giả định đã đặt, (2) chỗ đội cần tự kiểm tra, (3) lệnh để chạy/kiểm thử, (4) một dòng đề xuất cho docs/ai-usage-log.md.

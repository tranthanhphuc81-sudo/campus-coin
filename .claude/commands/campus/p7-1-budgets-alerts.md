---
description: "🔵 P7.1 – Ngân sách, handler cảnh báo và thông báo"
model: sonnet
---
# P7.1 – Ngân sách, handler cảnh báo và thông báo

> **Cấp AI: 🔵 Tầm trung agentic** – Kết hợp module budgets, handler sự kiện, bảng notifications và FE chuông thông báo.

Tuân thủ toàn bộ quy tắc trong AGENTS.md (đã được nạp tự động).

## Tài liệu tham chiếu (đọc trước khi làm)

- @docs/design/05-thiet-ke-chuc-nang.md
- @docs/design/06-thiet-ke-co-so-du-lieu.md
- @docs/design/07-thiet-ke-api.md

Tập trung vào: mục 5.11, 6.3.5 (budgets), 6.3.7 (notifications), 7.3.3 (budgets, notifications), Hình 21.

## Nhiệm vụ

Backend:
- api/src/modules/budgets: GET /budgets?month= (kèm spent, percent, level: ok|near|exceeded), PUT /budgets (upsert hàng loạt cho một tháng, chỉ danh mục chi), POST /budgets/copy-previous, DELETE /budgets/:id.
- api/src/events/handlers/budgetAlert.ts: khi có giao dịch CHI created/updated/deleted/restored → tính spent tháng của danh mục; nếu ≥ ngưỡng → NEAR_LIMIT, ≥ 100% → EXCEEDED; tạo notification với dedupe_key = `budget:{budgetId}:{level}:{month}` (UNIQUE) để chỉ gửi một lần; nếu spent giảm xuống dưới ngưỡng thì xóa dedupe_key tương ứng để cho phép cảnh báo lại.
- api/src/modules/notifications: GET /notifications (phân trang, unread count), POST /notifications/:id/read, POST /notifications/read-all.
Frontend:
- Trang Ngân sách: chọn tháng, bảng danh mục chi với ô nhập hạn mức và ngưỡng (50–100%), progress bar xanh < 80% / vàng 80–99% / đỏ ≥ 100% (kèm chữ, không chỉ dựa vào màu), nút "Copy last month".
- NotificationBell trên navbar: badge số chưa đọc, dropdown danh sách; refetchInterval 60 giây và invalidate ngay sau mutation giao dịch; toast khi có thông báo ngân sách mới.
Test: vượt ngưỡng 2 lần trong tháng chỉ tạo 1 thông báo; xóa giao dịch cho giảm dưới ngưỡng rồi vượt lại → tạo thông báo mới.

## Kết thúc

In: (1) giả định đã đặt, (2) chỗ đội cần tự kiểm tra, (3) lệnh để chạy/kiểm thử, (4) một dòng đề xuất cho docs/ai-usage-log.md.

---
name: p5-2-web-transactions
description: "🔵 P5.2 – Frontend: danh sách giao dịch, thêm nhanh, thùng rác, lịch sử"
agent: agent
---
# P5.2 – Frontend: danh sách giao dịch, thêm nhanh, thùng rác, lịch sử

> **Cấp AI: 🔵 Tầm trung agentic** – Nhiều component tương tác (bảng lọc, modal thêm nhanh, phím tắt, lịch sử) và đồng bộ URL query.

Tuân thủ toàn bộ quy tắc trong AGENTS.md (đã được nạp tự động).

## Tài liệu tham chiếu (đọc trước khi làm)

- [docs/design/05-thiet-ke-chuc-nang.md](../../docs/design/05-thiet-ke-chuc-nang.md)
- [docs/design/08-thiet-ke-giao-dien.md](../../docs/design/08-thiet-ke-giao-dien.md)

Tập trung vào: mục 5.4.1, 8.3 (màn hình giao dịch), 8.6 Trạng thái giao diện, 5.15.

## Nhiệm vụ

Xây dựng src/features/transactions:
1. QuickAddModal: loại Income/Expense (mặc định Expense), số tiền (ô nhập định dạng theo tiền tệ người dùng, số dạng tabular), ngày (mặc định hôm nay), mô tả, danh mục (CategorySelect – để sẵn chỗ cho chip "AI suggestion" ở Giai đoạn 9), công tắc "Repeat" mở thêm các trường định kỳ. Phím tắt: N mở, Enter lưu, Esc đóng. Mở được từ navbar, dashboard và nút nổi (FAB) trên mobile.
2. Trang Giao dịch: bộ lọc (khoảng ngày có preset, loại, nhiều danh mục, khoảng tiền, từ khóa) đồng bộ lên URL query; bảng trên desktop, danh sách thẻ trên mobile; phân trang; sửa inline qua modal (gửi version, xử lý 409 bằng hộp thoại "This transaction was changed elsewhere – reload?").
3. Trang Trash (thùng rác): khôi phục trong 30 ngày.
4. Drawer Lịch sử thay đổi của một giao dịch (hiển thị trường nào đổi từ gì sang gì).
5. Trạng thái rỗng có hướng dẫn "Log your first transaction", skeleton khi tải, toast khi lưu.
Mọi số tiền hiển thị qua một hàm formatMoney(amountString, currency) (định dạng en-US: $1,234.50; VND không có phần thập phân) duy nhất ở src/lib/money.ts.

## Kết thúc

In: (1) giả định đã đặt, (2) chỗ đội cần tự kiểm tra, (3) lệnh để chạy/kiểm thử, (4) một dòng đề xuất cho docs/ai-usage-log.md.

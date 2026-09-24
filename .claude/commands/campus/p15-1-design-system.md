---
description: "🟢 P15.1 – Design system, layout, dark mode, cỡ chữ"
model: haiku
---
# P15.1 – Design system, layout, dark mode, cỡ chữ

> **Cấp AI: 🟢 Rẻ/nhanh** – Chủ yếu SCSS và cấu hình theo design tokens có sẵn.

Tuân thủ toàn bộ quy tắc trong AGENTS.md (đã được nạp tự động).

## Tài liệu tham chiếu (đọc trước khi làm)

- @docs/design/05-thiet-ke-chuc-nang.md
- @docs/design/08-thiet-ke-giao-dien.md

Tập trung vào: mục 8.2 Design tokens, 5.15, 8.4.

## Nhiệm vụ

- src/styles: _tokens.scss (màu theo bảng 8.2 cho cả light/dark qua [data-bs-theme]), ghi đè biến Bootstrap 5.3, font Inter tự host (subset latin + vietnamese), số dạng tabular-nums cho cột tiền, bo góc 12px thẻ / 8px nút.
- ThemeProvider: dark mode theo prefers-color-scheme mặc định, công tắc trên navbar, lưu vào preferences (localStorage + PATCH /me).
- Font scale 4 mức (90/100/115/130%) đổi font-size của html; mọi kích thước dùng rem.
- Layout: PublicLayout, StudentLayout (navbar + sidebar desktop, bottom nav mobile, FAB thêm nhanh), AdminLayout.
- Chuyển trang 150–200 ms, tôn trọng prefers-reduced-motion; spinner trên nút đang xử lý.
- Trang 404 và trang lỗi chung.

## Kết thúc

In: (1) giả định đã đặt, (2) chỗ đội cần tự kiểm tra, (3) lệnh để chạy/kiểm thử, (4) một dòng đề xuất cho docs/ai-usage-log.md.

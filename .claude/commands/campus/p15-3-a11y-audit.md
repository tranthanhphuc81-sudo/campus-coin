---
description: "🔵 P15.3 – Rà soát khả năng tiếp cận (WCAG 2.2 AA)"
model: sonnet
---
# P15.3 – Rà soát khả năng tiếp cận (WCAG 2.2 AA)

> **Cấp AI: 🔵 Tầm trung agentic** – Phải quét và sửa nhiều file giao diện cùng lúc.

Tuân thủ toàn bộ quy tắc trong AGENTS.md (đã được nạp tự động).

## Tài liệu tham chiếu (đọc trước khi làm)

- @docs/design/08-thiet-ke-giao-dien.md

Tập trung vào: mục 8.5 Khả năng tiếp cận.

## Nhiệm vụ

Rà toàn bộ thư mục web/src và sửa:
- Mọi ô nhập có <label> liên kết; lỗi form gắn aria-describedby và aria-invalid.
- Mọi nút chỉ có icon có aria-label; icon trang trí aria-hidden.
- Điều hướng bàn phím đủ: thứ tự tab hợp lý, focus hiển thị rõ, modal bẫy focus và trả focus khi đóng, có link "Skip to main content".
- Tương phản ≥ 4.5:1 ở cả light và dark.
- Biểu đồ có bảng dữ liệu thay thế; màu progress bar luôn kèm chữ.
- Thông báo toast dùng aria-live.
Liệt kê từng file đã sửa và lý do. Sau đó cho tôi checklist kiểm tra thủ công bằng bàn phím và Lighthouse cho 6 trang chính.

## Kết thúc

In: (1) giả định đã đặt, (2) chỗ đội cần tự kiểm tra, (3) lệnh để chạy/kiểm thử, (4) một dòng đề xuất cho docs/ai-usage-log.md.

---
description: "🔵 P16.4 – Sửa lỗi bảo mật theo báo cáo"
model: sonnet
argument-hint: "<bảng kết quả P16.3 – chỉ giữ các dòng đội đã đồng ý sửa>"
---
# P16.4 – Sửa lỗi bảo mật theo báo cáo

> **Cấp AI: 🔵 Tầm trung agentic** – Sửa theo danh sách đã được phân tích sẵn, có thể chạm nhiều file.

Tuân thủ toàn bộ quy tắc trong AGENTS.md (đã được nạp tự động).

## Tài liệu tham chiếu (đọc trước khi làm)

- @docs/security/security-audit.md

## Nhiệm vụ

Đầu vào từ người dùng ($ARGUMENTS): bảng kết quả P16.3 – chỉ giữ các dòng đội đã đồng ý sửa

Sửa lần lượt từng lỗi trong bảng, theo thứ tự mức độ. Với mỗi lỗi: (1) sửa code, (2) viết thêm một test tái hiện lỗi và chứng minh đã được sửa, (3) ghi một dòng tóm tắt. Không thay đổi hành vi khác ngoài phạm vi lỗi.

## Kết thúc

In: (1) giả định đã đặt, (2) chỗ đội cần tự kiểm tra, (3) lệnh để chạy/kiểm thử, (4) một dòng đề xuất cho docs/ai-usage-log.md.

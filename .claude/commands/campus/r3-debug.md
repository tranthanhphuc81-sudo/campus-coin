---
description: "🔵 R-3 – Gỡ lỗi có hệ thống"
model: sonnet
argument-hint: "<mô tả lỗi, log, cách tái hiện>"
---
# R-3 – Gỡ lỗi có hệ thống

> **Cấp AI: 🔵 Tầm trung agentic** – Cần đọc log, code liên quan và chạy thử giả thuyết. Nâng lên 🔴 nếu lỗi liên quan dữ liệu sai lệch hoặc chỉ xảy ra ngẫu nhiên.

Tuân thủ toàn bộ quy tắc trong AGENTS.md (đã được nạp tự động).

## Nhiệm vụ

Mô tả lỗi ($ARGUMENTS) – nếu thiếu mục nào trong khung dưới, hỏi lại người dùng trước khi phân tích.

Lỗi: [mô tả hiện tượng]
Kỳ vọng: [...]
Thực tế: [...]
Cách tái hiện: [...]
Log / stack trace / response: [dán]
Đã thử: [...]

Hãy: (1) liệt kê tối đa 3 giả thuyết nguyên nhân xếp theo khả năng; (2) với giả thuyết đầu tiên, chỉ ra cách kiểm chứng (lệnh, log cần thêm, test cần viết); (3) chỉ đề xuất sửa sau khi đã xác định nguyên nhân, kèm test chống tái phát. Không sửa đoán mò nhiều chỗ cùng lúc.

## Kết thúc

In: (1) giả định đã đặt, (2) chỗ đội cần tự kiểm tra, (3) lệnh để chạy/kiểm thử, (4) một dòng đề xuất cho docs/ai-usage-log.md.

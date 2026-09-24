---
name: r5-optimize-query
description: "🔴 R-5 – Tối ưu truy vấn chậm"
agent: agent
argument-hint: "câu truy vấn, kết quả EXPLAIN ANALYZE, số lượng bản ghi các bảng liên quan, danh sách chỉ mục hiện có"
---
# R-5 – Tối ưu truy vấn chậm

> **Cấp AI: 🔴 Cao cấp/suy luận** – Đọc kế hoạch thực thi và chọn chỉ mục đúng cần suy luận; chỉ mục sai làm chậm ghi.

Tuân thủ toàn bộ quy tắc trong AGENTS.md (đã được nạp tự động).

## Nhiệm vụ

Đầu vào từ người dùng: ${input:userInput:câu truy vấn, kết quả EXPLAIN ANALYZE, số lượng bản ghi các bảng liên quan, danh sách chỉ mục hiện có}

Phân tích vì sao truy vấn chậm. Đề xuất: viết lại truy vấn và/hoặc chỉ mục mới (kèm thứ tự cột và lý do). Ước lượng ảnh hưởng tới tốc độ ghi. Nếu thêm chỉ mục, viết migration tương ứng.

## Kết thúc

In: (1) giả định đã đặt, (2) chỗ đội cần tự kiểm tra, (3) lệnh để chạy/kiểm thử, (4) một dòng đề xuất cho docs/ai-usage-log.md.

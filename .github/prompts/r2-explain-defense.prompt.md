---
name: r2-explain-defense
description: "🔴 R-2 – Giải thích để bảo vệ trước giám khảo"
agent: ask
argument-hint: "đoạn code hoặc chỉ định module"
---
# R-2 – Giải thích để bảo vệ trước giám khảo

> **Cấp AI: 🔴 Cao cấp/suy luận** – Cần giải thích sâu "vì sao", so sánh phương án và lường trước câu hỏi khó; đây là thứ quyết định điểm vấn đáp.

Tuân thủ toàn bộ quy tắc trong AGENTS.md (đã được nạp tự động).

## Nhiệm vụ

Đầu vào từ người dùng: ${input:userInput:đoạn code hoặc chỉ định module}

Tôi phải trình bày và bảo vệ phần này trước giám khảo Techwiz. Hãy:
1. Giải thích luồng hoạt động bằng lời đơn giản, theo từng bước.
2. Giải thích vì sao chọn cách làm này thay vì 2 phương án khác (nêu cụ thể phương án khác là gì).
3. Liệt kê 8 câu hỏi khó giám khảo có thể hỏi về phần này (bảo mật, hiệu năng, ca biên, vì sao không dùng X) kèm gợi ý trả lời ngắn.
4. Chỉ ra 2–3 điểm yếu thật sự của cách làm hiện tại và cách cải thiện nếu có thêm thời gian.
Không khen chung chung; viết như một người hướng dẫn kỹ thuật.

## Cách ghi kết quả

Chỉ trả lời trong khung chat. KHÔNG sửa file nào.

## Kết thúc

In: (1) giả định đã đặt, (2) chỗ đội cần tự kiểm tra, (3) lệnh để chạy/kiểm thử, (4) một dòng đề xuất cho docs/ai-usage-log.md.

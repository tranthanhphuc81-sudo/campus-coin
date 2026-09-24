---
description: "🟢 P9.2 – Frontend: chip \"AI suggestion\" trong form giao dịch"
model: haiku
---
# P9.2 – Frontend: chip "AI suggestion" trong form giao dịch

> **Cấp AI: 🟢 Rẻ/nhanh** – Component nhỏ trên API đã có; logic debounce và hủy request là mẫu quen thuộc.

Tuân thủ toàn bộ quy tắc trong AGENTS.md (đã được nạp tự động).

## Tài liệu tham chiếu (đọc trước khi làm)

- @docs/design/05-thiet-ke-chuc-nang.md
- @docs/design/09-bao-mat.md

Tập trung vào: mục 5.6 (phía client), Hình 12.

## Nhiệm vụ

Cập nhật CategorySelect trong QuickAddModal:
- Khi mô tả ≥ 3 ký tự và người dùng bật AI: debounce 400 ms gọi /ai/categorize/suggest, hủy request cũ bằng AbortController.
- confidence ≥ 0,6 → tự điền danh mục + chip "AI suggestion" (tooltip giải thích nguồn: "Your rule" / "Keyword" / "AI"); < 0,6 → hiện top gợi ý dạng nút chọn nhanh.
- Khi lưu: đặt categorySource = ai_accepted nếu giữ nguyên, ai_overridden nếu đổi, user nếu không có gợi ý; gửi kèm aiSuggestedCategoryId, aiConfidence.
- Lỗi AI không hiện lỗi đỏ, không chặn nút Lưu.
Thêm công tắc "Enable AI suggestions" trong trang Hồ sơ kèm đoạn giải thích dữ liệu nào được gửi (theo mục 9.9).

## Kết thúc

In: (1) giả định đã đặt, (2) chỗ đội cần tự kiểm tra, (3) lệnh để chạy/kiểm thử, (4) một dòng đề xuất cho docs/ai-usage-log.md.

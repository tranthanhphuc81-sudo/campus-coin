---
description: "🔵 R-1 – Rà soát code trước khi merge"
model: sonnet
argument-hint: "<diff của Pull Request hoặc chỉ định nhánh>"
allowed-tools: Read, Grep, Glob, Bash(git diff:*), Bash(git log:*)
---
# R-1 – Rà soát code trước khi merge

> **Cấp AI: 🔵 Tầm trung agentic** – Đọc diff nhiều file và đối chiếu quy ước. Nâng lên 🔴 nếu diff chạm auth, phân quyền hoặc tiền.

Tuân thủ toàn bộ quy tắc trong AGENTS.md (đã được nạp tự động).

## Nhiệm vụ

Đầu vào từ người dùng ($ARGUMENTS): diff của Pull Request hoặc chỉ định nhánh

Rà soát diff này như một reviewer khó tính. Kiểm tra: đúng quy ước trong CLAUDE.md; lọc userId; validate Zod; xử lý lỗi Problem Details; số tiền dùng Decimal/chuỗi; timezone; test có đủ trường hợp thành công + bị từ chối; không có any, console.log, secret; chuỗi giao diện tiếng Anh đã nằm trong web/src/content/en.ts.
Trả về: danh sách vấn đề theo mức độ (Phải sửa / Nên sửa / Góp ý), mỗi vấn đề có file:dòng và đề xuất cụ thể. KHÔNG tự sửa.

## Cách ghi kết quả

Chỉ trả lời trong khung chat. KHÔNG sửa file nào.

## Kết thúc

In: (1) giả định đã đặt, (2) chỗ đội cần tự kiểm tra, (3) lệnh để chạy/kiểm thử, (4) một dòng đề xuất cho docs/ai-usage-log.md.

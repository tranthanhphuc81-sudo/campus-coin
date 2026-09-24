---
description: "🔵 P4.1 – Module danh mục (backend + frontend)"
model: sonnet
---
# P4.1 – Module danh mục (backend + frontend)

> **Cấp AI: 🔵 Tầm trung agentic** – Có quy tắc nghiệp vụ (reassign khi xóa, không trùng tên theo loại) và cả FE lẫn BE.

Tuân thủ toàn bộ quy tắc trong AGENTS.md (đã được nạp tự động).

## Tài liệu tham chiếu (đọc trước khi làm)

- @docs/design/05-thiet-ke-chuc-nang.md
- @docs/design/06-thiet-ke-co-so-du-lieu.md
- @docs/design/07-thiet-ke-api.md
- @docs/decisions/ADR-DB-01.md

Tập trung vào: mục 5.3, 6.3.3, 7.3.2 (categories), ADR-DB-01.

**Điều kiện tiên quyết:** các file `docs/decisions/ADR-DB-01.md` phải tồn tại và có trạng thái `Accepted`. Nếu chưa, DỪNG và nhắc người dùng chạy prompt bước A tương ứng.

## Nhiệm vụ

Backend api/src/modules/categories:
- GET /categories?type=income|expense: danh mục mặc định đang hoạt động + danh mục cá nhân của người dùng, sắp theo sortOrder.
- POST/PATCH /categories: chỉ danh mục cá nhân; tên không trùng trong cùng loại của người dùng và không trùng danh mục mặc định (409 conflict); giới hạn 50 danh mục cá nhân/người dùng.
- DELETE /categories/:id?reassignTo=: nếu đã có giao dịch thì BẮT BUỘC reassignTo (cùng loại, người dùng sở hữu hoặc mặc định), chuyển giao dịch trong một DB transaction rồi lưu trữ (is_active=false); chưa có giao dịch thì xóa hẳn.
- Không cho sửa/xóa danh mục mặc định qua API sinh viên.
Frontend src/features/categories: trang "Manage My Categories" với 2 tab Income/Expense, danh sách thẻ có icon và màu, modal thêm/sửa (chọn icon từ danh sách Bootstrap Icons, chọn màu), hộp thoại xóa có chọn danh mục thay thế. Hook TanStack Query: useCategories(type), useCreateCategory... invalidate đúng query key.
Test: xóa danh mục có giao dịch mà không reassignTo → 422; gán danh mục người khác → 404.

## Kết thúc

In: (1) giả định đã đặt, (2) chỗ đội cần tự kiểm tra, (3) lệnh để chạy/kiểm thử, (4) một dòng đề xuất cho docs/ai-usage-log.md.

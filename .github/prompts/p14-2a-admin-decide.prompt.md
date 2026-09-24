---
name: p14-2a-admin-decide
description: "🔴 P14.2-A – Chốt phạm vi quyền và quyền riêng tư của admin"
agent: agent
---
# P14.2-A – Chốt phạm vi quyền và quyền riêng tư của admin

> **Cấp AI: 🔴 Cao cấp/suy luận** – Admin là vai trò đặc quyền; cần chốt rõ admin được thấy gì để không vi phạm yêu cầu "chỉ chủ sở hữu xem được dữ liệu tài chính".

Tuân thủ toàn bộ quy tắc trong AGENTS.md (đã được nạp tự động).

## Tài liệu tham chiếu (đọc trước khi làm)

- [docs/design/05-thiet-ke-chuc-nang.md](../../docs/design/05-thiet-ke-chuc-nang.md)
- [docs/design/07-thiet-ke-api.md](../../docs/design/07-thiet-ke-api.md)
- [docs/design/09-bao-mat.md](../../docs/design/09-bao-mat.md)

Tập trung vào: mục 5.13 (bảng chức năng quản trị), 9.6, 9.12, 7.3.4.

## Nhiệm vụ

KHÔNG VIẾT CODE. Chốt:
1. Danh sách trường admin được xem ở /admin/users và /admin/users/:id (không có giao dịch, số dư, mô tả).
2. Thống kê: định nghĩa chính xác DAU/MAU (dựa last_login_at hay audit), tổng giao dịch, danh mục dùng nhiều nhất, tỷ lệ chấp nhận AI, số nhận định; quy tắc ẩn nhóm < 5 người dùng (k-anonymity) áp dụng ở đâu.
3. Vô hiệu hóa tài khoản: thu hồi mọi phiên ngay; admin không tự vô hiệu hóa chính mình; không vô hiệu hóa admin cuối cùng.
4. Danh mục mặc định: "ẩn" thay vì xóa khi đã có giao dịch; đổi tên có ảnh hưởng dữ liệu lịch sử không.
5. Tip templates và announcements: lọc HTML thế nào (chỉ văn bản thuần hay allowlist), xem trước trước khi xuất bản.
6. Danh sách hành động admin phải ghi audit_logs và trường metadata.
Trả về ADR-ADMIN-01.

## Cách ghi kết quả

Chỉ tạo hoặc cập nhật DUY NHẤT file `docs/decisions/ADR-ADMIN-01.md` theo mẫu `docs/decisions/ADR-TEMPLATE.md`, trạng thái `Proposed`. KHÔNG tạo hay sửa file code nào. Đội sẽ đọc, chỉnh và đổi trạng thái sang `Accepted` trước khi chạy bước B.

## Kết thúc

In: (1) giả định đã đặt, (2) chỗ đội cần tự kiểm tra, (3) lệnh để chạy/kiểm thử, (4) một dòng đề xuất cho docs/ai-usage-log.md.

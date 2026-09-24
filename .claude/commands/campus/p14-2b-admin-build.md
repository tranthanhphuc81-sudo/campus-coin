---
description: "🔵 P14.2-B – Hiện thực khu vực quản trị"
model: sonnet
---
# P14.2-B – Hiện thực khu vực quản trị

> **Cấp AI: 🔵 Tầm trung agentic** – Nhiều trang CRUD và thống kê cả FE lẫn BE.

Tuân thủ toàn bộ quy tắc trong AGENTS.md (đã được nạp tự động).

## Tài liệu tham chiếu (đọc trước khi làm)

- @docs/design/07-thiet-ke-api.md
- @docs/design/08-thiet-ke-giao-dien.md
- @docs/decisions/ADR-ADMIN-01.md

Tập trung vào: ADR-ADMIN-01, mục 7.3.4, 8.1 Sitemap (khu admin).

**Điều kiện tiên quyết:** các file `docs/decisions/ADR-ADMIN-01.md` phải tồn tại và có trạng thái `Accepted`. Nếu chưa, DỪNG và nhắc người dùng chạy prompt bước A tương ứng.

## Nhiệm vụ

Backend api/src/modules/admin (mọi route authorize('admin')): stats/overview, stats/categories-usage, users (tìm kiếm, phân trang), users/:id, users/:id/disable|enable, users/:id/send-reset, CRUD categories (mặc định), CRUD tip-templates, CRUD announcements, GET audit-logs (lọc thời gian, hành động, người thực hiện). Ghi audit đúng ADR. GET /announcements/active cho người dùng.
Frontend AdminLayout (menu riêng, tải lazy): Dashboard thống kê (thẻ số + biểu đồ), Người dùng, Danh mục mặc định (kéo thả sắp xếp), Mẫu mẹo (có ô xem trước khi thay biến bằng giá trị mẫu), Thông báo hệ thống (thời gian hiệu lực), Nhật ký kiểm toán (chỉ đọc).
Test: admin không gọi được API lấy giao dịch người dùng; vô hiệu hóa → refresh token của user đó bị thu hồi; sinh viên gọi /admin/* → 403.

## Kết thúc

In: (1) giả định đã đặt, (2) chỗ đội cần tự kiểm tra, (3) lệnh để chạy/kiểm thử, (4) một dòng đề xuất cho docs/ai-usage-log.md.

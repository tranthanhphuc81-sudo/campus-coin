---
description: "🟢 P3.2 – Hồ sơ người dùng và phiên đăng nhập"
model: haiku
---
# P3.2 – Hồ sơ người dùng và phiên đăng nhập

> **Cấp AI: 🟢 Rẻ/nhanh** – CRUD đơn giản trên nền auth đã có.

Tuân thủ toàn bộ quy tắc trong AGENTS.md (đã được nạp tự động).

## Tài liệu tham chiếu (đọc trước khi làm)

- @docs/design/05-thiet-ke-chuc-nang.md
- @docs/design/07-thiet-ke-api.md

Tập trung vào: mục 5.2, 7.3.1 (các endpoint /me).

## Nhiệm vụ

Tạo module api/src/modules/me:
- GET/PATCH /me: cập nhật fullName, academicYear, monthlyAllowanceBaseline, monthlySavingsGoal, currency (USD|VND), timezone (IANA hợp lệ), preferences {theme, fontScale}, aiOptIn. Không cho sửa email, role, status.
- PATCH /me/password: cần mật khẩu hiện tại; thành công thì thu hồi mọi refresh token trừ phiên hiện tại.
- GET /me/sessions, DELETE /me/sessions/:id.
- GET /me/export: trả JSON toàn bộ dữ liệu cá nhân (hồ sơ, danh mục, giao dịch, ngân sách, nhận định).
- DELETE /me: yêu cầu nhập lại mật khẩu; đặt deleted_at (ân hạn 30 ngày), thu hồi mọi phiên.
Kèm test: không sửa được role qua PATCH /me; đổi mật khẩu sai mật khẩu cũ → 422.

## Kết thúc

In: (1) giả định đã đặt, (2) chỗ đội cần tự kiểm tra, (3) lệnh để chạy/kiểm thử, (4) một dòng đề xuất cho docs/ai-usage-log.md.

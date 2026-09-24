---
description: "🔴 P3.1-A – Chốt thiết kế token và phiên"
model: opus
allowed-tools: Read, Grep, Glob
---
# P3.1-A – Chốt thiết kế token và phiên

> **Cấp AI: 🔴 Cao cấp/suy luận** – Đây là phần bảo mật quan trọng nhất; lỗi thiết kế (vd. phát hiện reuse sai khi 2 tab cùng refresh) gây đăng xuất oan hoặc lỗ hổng chiếm phiên.

Tuân thủ toàn bộ quy tắc trong AGENTS.md (đã được nạp tự động).

## Tài liệu tham chiếu (đọc trước khi làm)

- @docs/design/05-thiet-ke-chuc-nang.md
- @docs/design/06-thiet-ke-co-so-du-lieu.md
- @docs/design/07-thiet-ke-api.md
- @docs/design/09-bao-mat.md

Tập trung vào: mục 5.1, 6.3.2, 7.3.1, 7.4, 9.5, 9.6.

## Nhiệm vụ

KHÔNG VIẾT CODE. Hãy chốt thiết kế chi tiết cho hệ thống xác thực, trả lời từng câu:
1. Access token: thuật toán ký (EdDSA hay RS256), claims (sub, role, sid, iat, exp, kid), TTL 15 phút, nơi lưu phía client (bộ nhớ).
2. Refresh token: chuỗi ngẫu nhiên 256-bit, lưu SHA-256 trong refresh_tokens; cookie tên gì, thuộc tính (HttpOnly, Secure, SameSite=Strict, Path=/api/v1/auth). Cookie riêng cho admin hay dùng chung?
3. Xoay vòng + phát hiện dùng lại: thuật toán cụ thể với family_id. XỬ LÝ TRƯỜNG HỢP 2 tab/2 request refresh gần như đồng thời (đề xuất grace window bao nhiêu giây, trả về gì cho request thứ hai) để không bị coi nhầm là tấn công.
4. Khóa tài khoản: failed_login_count, locked_until 15 phút sau 5 lần sai; chống dò email (thông điệp chung + vẫn chạy argon2 với hash giả khi email không tồn tại).
5. Xác minh email và reset mật khẩu: định dạng token, TTL (24 giờ / 30 phút), dùng một lần, vô hiệu token cũ khi tạo mới; đổi mật khẩu → thu hồi mọi refresh token.
6. Admin: /admin/auth/login chỉ nhận role=admin, TTL access 10 phút, idle timeout 30 phút – cài đặt thế nào không cần MFA.
7. CSRF: vì refresh dùng cookie, cần kiểm tra Origin/Referer ở /auth/refresh và /auth/logout – mô tả cách làm.
8. Tham số argon2id (memoryCost, timeCost, parallelism) hợp lý cho VPS 2 vCPU.
9. Danh sách audit log cần ghi ở luồng xác thực.
Trả về ADR-AUTH-01 dạng Markdown, kèm sơ đồ trạng thái của một refresh token (active → rotated → revoked) bằng Mermaid.

## Cách ghi kết quả

Chỉ tạo hoặc cập nhật DUY NHẤT file `docs/decisions/ADR-AUTH-01.md` theo mẫu `docs/decisions/ADR-TEMPLATE.md`, trạng thái `Proposed`. KHÔNG tạo hay sửa file code nào. Đội sẽ đọc, chỉnh và đổi trạng thái sang `Accepted` trước khi chạy bước B.

## Kết thúc

In: (1) giả định đã đặt, (2) chỗ đội cần tự kiểm tra, (3) lệnh để chạy/kiểm thử, (4) một dòng đề xuất cho docs/ai-usage-log.md.

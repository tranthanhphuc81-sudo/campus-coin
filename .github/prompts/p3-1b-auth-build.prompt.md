---
name: p3-1b-auth-build
description: "🔵 P3.1-B – Hiện thực module auth backend"
agent: agent
---
# P3.1-B – Hiện thực module auth backend

> **Cấp AI: 🔵 Tầm trung agentic** – Module lớn (routes, service, repository, token lib, mailer, rate limit) cần làm đúng ADR đã chốt.

Tuân thủ toàn bộ quy tắc trong AGENTS.md (đã được nạp tự động).

## Tài liệu tham chiếu (đọc trước khi làm)

- [docs/design/07-thiet-ke-api.md](../../docs/design/07-thiet-ke-api.md)
- [docs/decisions/ADR-AUTH-01.md](../../docs/decisions/ADR-AUTH-01.md)

Tập trung vào: kết quả ADR-AUTH-01, mục 7.3.1, 7.4.

**Điều kiện tiên quyết:** các file `docs/decisions/ADR-AUTH-01.md` phải tồn tại và có trạng thái `Accepted`. Nếu chưa, DỪNG và nhắc người dùng chạy prompt bước A tương ứng.

## Nhiệm vụ

Hiện thực module api/src/modules/auth theo ĐÚNG ADR-AUTH-01:
- Endpoints: POST /auth/register (202), /auth/verify-email, /auth/resend-verification, /auth/login, /auth/refresh, /auth/logout, /auth/logout-all, /auth/forgot-password (luôn 202), /auth/reset-password, POST /admin/auth/login.
- api/src/lib/tokens.ts: signAccessToken, verifyAccessToken (jose), generateOpaqueToken, sha256.
- api/src/middlewares/authenticate.ts (đọc Bearer, gắn req.user = {id, role, sessionId}) và authorize(...roles).
- api/src/integrations/mailer.ts (Nodemailer, template HTML + text bằng tiếng Anh cho: xác minh email, đặt lại mật khẩu, mật khẩu vừa đổi) – gửi không chặn phản hồi, có retry 3 lần, lỗi thì log.
- Rate limit riêng theo bảng 7.4 cho login, register, forgot-password, resend-verification (express-rate-limit, keyGenerator theo IP + email).
- Schema Zod dùng chung đặt ở packages/shared (registerSchema: mật khẩu ≥ 10 ký tự, chặn 1.000 mật khẩu phổ biến nhất – file danh sách riêng).
- Ghi audit_logs theo ADR.
Test Supertest bắt buộc: đăng ký → xác minh → đăng nhập; sai mật khẩu 5 lần bị khóa; refresh xoay vòng; dùng lại refresh cũ → thu hồi cả family; 2 refresh đồng thời trong grace window không bị thu hồi; sinh viên gọi /admin/* bị 403; reset mật khẩu thu hồi phiên cũ.

## Kết thúc

In: (1) giả định đã đặt, (2) chỗ đội cần tự kiểm tra, (3) lệnh để chạy/kiểm thử, (4) một dòng đề xuất cho docs/ai-usage-log.md.

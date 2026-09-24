---
name: p3-3-web-auth
description: "🔵 P3.3 – Frontend: auth, axios interceptor, route bảo vệ"
agent: agent
---
# P3.3 – Frontend: auth, axios interceptor, route bảo vệ

> **Cấp AI: 🔵 Tầm trung agentic** – Logic refresh đồng thời phía client dễ sai; nhiều file (context, axios, route guard, 6 trang).

Tuân thủ toàn bộ quy tắc trong AGENTS.md (đã được nạp tự động).

## Tài liệu tham chiếu (đọc trước khi làm)

- [docs/design/04-kien-truc-he-thong.md](../../docs/design/04-kien-truc-he-thong.md)
- [docs/design/08-thiet-ke-giao-dien.md](../../docs/design/08-thiet-ke-giao-dien.md)
- [docs/decisions/ADR-AUTH-01.md](../../docs/decisions/ADR-AUTH-01.md)

Tập trung vào: mục 4.3 Kiến trúc Frontend, 8.1 Sitemap, ADR-AUTH-01.

**Điều kiện tiên quyết:** các file `docs/decisions/ADR-AUTH-01.md` phải tồn tại và có trạng thái `Accepted`. Nếu chưa, DỪNG và nhắc người dùng chạy prompt bước A tương ứng.

## Nhiệm vụ

Xây dựng phần xác thực cho web:
1. src/lib/api.ts: axios instance baseURL /api/v1, withCredentials. Interceptor request gắn access token từ bộ nhớ. Interceptor response: khi 401 type token-expired → gọi /auth/refresh MỘT LẦN duy nhất dù nhiều request cùng lỗi (dùng một promise dùng chung), xếp các request đang chờ và gửi lại; refresh thất bại → xóa phiên, điều hướng về /login (hoặc /admin/login nếu đang ở khu admin).
2. src/app/AuthProvider.tsx: lưu token + user trong React Context (KHÔNG localStorage); khi tải trang gọi /auth/refresh để khôi phục phiên.
3. src/app/ProtectedRoute.tsx theo role.
4. Trang: Login, Register (có thanh độ mạnh mật khẩu), VerifyEmail (đọc token từ URL), ForgotPassword, ResetPassword, AdminLogin – dùng React Hook Form + zodResolver với schema từ @campus-coin/shared; hiển thị lỗi theo field từ Problem Details errors[].
5. src/lib/problem.ts: hàm chuyển Problem Details thành lỗi form và toast.
Mọi chuỗi giao diện bằng tiếng Anh, đặt trong src/content/en.ts.

## Kết thúc

In: (1) giả định đã đặt, (2) chỗ đội cần tự kiểm tra, (3) lệnh để chạy/kiểm thử, (4) một dòng đề xuất cho docs/ai-usage-log.md.

# 7. THIẾT KẾ API

## 7.1 Quy ước chung

***Bảng 40: Quy ước API***

| **Hạng mục**  | **Quy ước**                                                                                                                                   |
|---------------|-----------------------------------------------------------------------------------------------------------------------------------------------|
| Base URL      | https://\<domain\>/api/v1 – phiên bản trong đường dẫn; thay đổi phá vỡ → v2                                                                   |
| Định dạng     | JSON UTF-8; tên trường camelCase; ngày YYYY-MM-DD; thời điểm ISO 8601 UTC; số tiền dạng chuỗi thập phân "12.50" để tránh sai số dấu phẩy động |
| Xác thực      | Header Authorization: Bearer \<accessToken\>; refresh token chỉ qua cookie HttpOnly tới /auth/refresh                                         |
| Phân trang    | Query page, limit (≤ 100); phản hồi kèm meta: {page, limit, total, totalPages}                                                                |
| Lọc / sắp xếp | from, to, type, categoryId (nhiều giá trị phân tách dấu phẩy), q, minAmount, maxAmount, sort=-txnDate                                         |
| Đồng thời     | Cập nhật giao dịch gửi version; xung đột trả 409                                                                                              |
| Idempotency   | POST tạo giao dịch/commit import chấp nhận header Idempotency-Key (lưu 24 giờ) chống gửi lặp khi mạng chập chờn                               |
| Mã trạng thái | 200 OK, 201 Created, 202 Accepted, 204 No Content, 400, 401, 403, 404, 409, 413, 415, 422, 429, 500, 503                                      |
| Truy vết      | Mọi phản hồi có header X-Request-Id (trùng với log server)                                                                                    |
| Tài liệu      | Đặc tả OpenAPI 3.1 sinh từ schema Zod, xem tại /api/docs (chỉ bật ở dev/staging)                                                              |

## 7.2 Định dạng lỗi chuẩn

Lỗi trả về theo RFC 9457 (Problem Details), content-type application/problem+json, gồm các trường: type, title, status, detail, instance, requestId và errors (danh sách lỗi theo trường khi validate thất bại). Thông điệp lỗi không bao giờ chứa stack trace, câu SQL hay thông tin nội bộ.

***Bảng 41: Mã lỗi chuẩn***

| **HTTP**  | **Mã lỗi (type)**                          | **Khi nào**                                                                        |
|-----------|--------------------------------------------|------------------------------------------------------------------------------------|
| 400       | bad-request                                | JSON sai cú pháp, tham số không hợp lệ                                             |
| 401       | unauthenticated / token-expired            | Thiếu/sai/hết hạn access token                                                     |
| 403       | forbidden                                  | Không đủ quyền theo vai trò (ví dụ sinh viên gọi API admin)                        |
| 404       | not-found                                  | Tài nguyên không tồn tại **hoặc thuộc người dùng khác** (không tiết lộ sự tồn tại) |
| 409       | conflict / version-mismatch                | Trùng tên danh mục, xung đột phiên bản, import trùng file                          |
| 413 / 415 | payload-too-large / unsupported-media-type | File vượt 2 MB, sai định dạng                                                      |
| 422       | validation-failed                          | Dữ liệu vi phạm quy tắc nghiệp vụ, kèm errors\[\] theo trường                      |
| 429       | rate-limited                               | Vượt giới hạn tần suất, kèm header Retry-After                                     |
| 500 / 503 | internal-error / service-unavailable       | Lỗi không mong đợi / bảo trì, phụ thuộc lỗi                                        |

## 7.3 Danh mục endpoint

Ký hiệu quyền: **P** = công khai, **S** = sinh viên đã đăng nhập, **A** = quản trị viên (đã qua MFA), **C** = cookie refresh. Mọi endpoint S chỉ thao tác trên dữ liệu của chính người gọi.

### 7.3.1 Xác thực và hồ sơ

***Bảng 42: API xác thực và hồ sơ***

| **Method**   | **Endpoint**                    | **Quyền**    | **Mô tả**                                           |
|--------------|---------------------------------|--------------|-----------------------------------------------------|
| POST         | /auth/register                  | P            | Đăng ký tài khoản sinh viên (202)                   |
| POST         | /auth/verify-email              | P            | Xác minh email bằng token                           |
| POST         | /auth/resend-verification       | P            | Gửi lại email xác minh                              |
| POST         | /auth/login                     | P            | Đăng nhập sinh viên → access token + cookie refresh |
| POST         | /auth/refresh                   | C            | Làm mới token (xoay vòng)                           |
| POST         | /auth/logout                    | S/A          | Thu hồi phiên hiện tại                              |
| POST         | /auth/logout-all                | S/A          | Thu hồi mọi phiên                                   |
| POST         | /auth/forgot-password           | P            | Yêu cầu link đặt lại mật khẩu (luôn 202)            |
| POST         | /auth/reset-password            | P            | Đặt mật khẩu mới bằng token                         |
| POST         | /admin/auth/login               | P            | Bước 1 đăng nhập admin → mfaToken (5 phút)          |
| POST         | /admin/auth/mfa/verify          | P (mfaToken) | Bước 2: xác minh TOTP → phiên admin                 |
| GET / PATCH  | /me                             | S/A          | Xem / cập nhật hồ sơ                                |
| PATCH        | /me/password                    | S/A          | Đổi mật khẩu (cần mật khẩu hiện tại)                |
| GET / DELETE | /me/sessions, /me/sessions/{id} | S/A          | Danh sách / thu hồi phiên                           |
| GET          | /me/export                      | S            | Tải toàn bộ dữ liệu cá nhân (JSON/CSV)              |
| DELETE       | /me                             | S            | Yêu cầu xóa tài khoản (cần nhập lại mật khẩu)       |

### 7.3.2 Danh mục, giao dịch, định kỳ, nhập CSV, AI

***Bảng 43: API giao dịch và phân loại***

| **Method**            | **Endpoint**                    | **Quyền** | **Mô tả**                                     |
|-----------------------|---------------------------------|-----------|-----------------------------------------------|
| GET                   | /categories?type=               | S         | Danh mục mặc định + cá nhân                   |
| POST / PATCH / DELETE | /categories, /categories/{id}   | S         | CRUD danh mục cá nhân; DELETE nhận reassignTo |
| GET                   | /transactions                   | S         | Danh sách có lọc, phân trang                  |
| GET                   | /transactions/{id}              | S         | Chi tiết (ghi recent_activity)                |
| POST                  | /transactions                   | S         | Tạo giao dịch (kèm tùy chọn định kỳ)          |
| PATCH                 | /transactions/{id}              | S         | Sửa (yêu cầu version)                         |
| DELETE                | /transactions/{id}              | S         | Xóa mềm                                       |
| POST                  | /transactions/{id}/restore      | S         | Khôi phục từ thùng rác                        |
| GET                   | /transactions/{id}/history      | S         | Lịch sử thay đổi                              |
| POST                  | /transactions/{id}/resolve-flag | S         | Xác nhận/bỏ cờ bất thường, trùng lặp          |
| GET / POST            | /recurring-rules                | S         | Danh sách / tạo quy tắc định kỳ               |
| PATCH / DELETE        | /recurring-rules/{id}           | S         | Sửa, tạm dừng / xóa quy tắc                   |
| GET                   | /imports/template               | S         | Tải file CSV mẫu                              |
| POST                  | /imports                        | S         | Tải lên CSV (multipart) → 202 {batchId}       |
| GET                   | /imports/{id}                   | S         | Trạng thái + bản xem trước + lỗi              |
| PATCH                 | /imports/{id}/rows              | S         | Sửa danh mục / bỏ chọn dòng                   |
| POST                  | /imports/{id}/commit            | S         | Xác nhận nhập (một DB transaction)            |
| DELETE                | /imports/{id}                   | S         | Hủy lô nhập                                   |
| POST                  | /ai/categorize/suggest          | S         | Gợi ý danh mục cho mô tả                      |
| POST                  | /ai/feedback                    | S         | Ghi nhận chấp nhận/ghi đè gợi ý               |

### 7.3.3 Dashboard, báo cáo, ngân sách, nhận định, mẹo, thông báo

***Bảng 44: API phân tích và tương tác***

| **Method**                  | **Endpoint**                                      | **Quyền** | **Mô tả**                                          |
|-----------------------------|---------------------------------------------------|-----------|----------------------------------------------------|
| GET                         | /dashboard/summary?month=                         | S         | Toàn bộ dữ liệu widget dashboard                   |
| GET                         | /reports/category-breakdown                       | S         | Báo cáo theo danh mục (from, to, type, categoryId) |
| GET                         | /reports/income-vs-expense?months=6               | S         | Thu vs chi theo tháng                              |
| GET                         | /reports/daily-weekly?month=                      | S         | Tổng theo ngày và tuần                             |
| GET                         | /reports/monthly/export?month=&format=pdf         | S         | Tải PDF báo cáo tháng                              |
| POST                        | /reports/monthly/share                            | S         | Gửi PDF qua email (≤ 5/ngày)                       |
| GET                         | /forecast/next-month                              | S         | Dự báo tháng tới                                   |
| GET                         | /budgets?month=                                   | S         | Ngân sách + mức tiêu thụ                           |
| PUT                         | /budgets                                          | S         | Tạo/cập nhật hàng loạt ngân sách của tháng         |
| POST                        | /budgets/copy-previous                            | S         | Sao chép ngân sách tháng trước                     |
| DELETE                      | /budgets/{id}                                     | S         | Xóa ngân sách                                      |
| GET                         | /insights, /insights/{month}                      | S         | Lịch sử / chi tiết nhận định                       |
| POST                        | /insights/{month}/regenerate                      | S         | Tạo lại (≤ 3 lần/tháng) → 202                      |
| GET                         | /tips                                             | S         | Danh sách tip đã xếp hạng                          |
| POST                        | /tips/{id}/pin \| unpin \| dismiss                | S         | Tương tác với tip                                  |
| GET                         | /notifications                                    | S         | Danh sách thông báo                                |
| POST                        | /notifications/stream-ticket                      | S         | Lấy vé SSE dùng một lần (30 giây)                  |
| GET                         | /notifications/stream?ticket=                     | Vé        | Kênh SSE                                           |
| POST                        | /notifications/{id}/read, /notifications/read-all | S         | Đánh dấu đã đọc                                    |
| GET / POST / PATCH / DELETE | /bookmarks, /bookmarks/{id}                       | S         | Quản lý bookmark và ghi chú                        |
| GET                         | /activity/recent                                  | S         | Giao dịch xem/sửa gần đây                          |
| GET                         | /announcements/active                             | P/S       | Thông báo hệ thống đang hiệu lực                   |

### 7.3.4 Quản trị và hệ thống

***Bảng 45: API quản trị***

| **Method** | **Endpoint**                        | **Quyền** | **Mô tả**                                         |
|------------|-------------------------------------|-----------|---------------------------------------------------|
| GET        | /admin/stats/overview               | A         | Người dùng hoạt động, tổng giao dịch, tăng trưởng |
| GET        | /admin/stats/categories-usage       | A         | Danh mục dùng nhiều nhất                          |
| GET        | /admin/users, /admin/users/{id}     | A         | Tìm kiếm / xem tài khoản (không kèm giao dịch)    |
| POST       | /admin/users/{id}/disable \| enable | A         | Vô hiệu hóa / kích hoạt (ghi audit)               |
| POST       | /admin/users/{id}/send-reset        | A         | Gửi link đặt lại mật khẩu cho người dùng          |
| CRUD       | /admin/categories                   | A         | Danh mục mặc định                                 |
| CRUD       | /admin/tip-templates                | A         | Mẫu mẹo                                           |
| CRUD       | /admin/announcements                | A         | Thông báo hệ thống                                |
| GET        | /admin/audit-logs                   | A         | Tra cứu nhật ký kiểm toán                         |
| GET        | /health/live, /health/ready         | Nội bộ    | Kiểm tra sống / sẵn sàng (DB, Redis)              |

## 7.4 Giới hạn tần suất (Rate limiting)

***Bảng 46: Chính sách rate limit***

| **Nhóm endpoint**                                | **Giới hạn**                          | **Khóa đếm**   |
|--------------------------------------------------|---------------------------------------|----------------|
| /auth/login, /admin/auth/\*                      | 5 lần / phút; 20 lần / giờ            | IP + email     |
| /auth/register                                   | 5 lần / giờ                           | IP             |
| /auth/forgot-password, /auth/resend-verification | 3 lần / giờ                           | Email + IP     |
| /ai/categorize/suggest                           | 60 lần / phút; 200 lời gọi LLM / ngày | userId         |
| /imports (POST)                                  | 10 lần / giờ                          | userId         |
| /reports/monthly/share                           | 5 lần / ngày                          | userId         |
| /insights/\*/regenerate                          | 3 lần / tháng                         | userId + tháng |
| Các API đã xác thực khác                         | 300 lần / phút                        | userId         |
| Toàn cục (Nginx)                                 | 20 request/giây, burst 40             | IP             |

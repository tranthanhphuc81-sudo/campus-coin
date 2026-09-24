<!-- Trích từ Tài liệu thiết kế kỹ thuật Campus Coin v1.0 (bản đã sửa). Nguồn gốc: file Word. Không sửa trực tiếp ở đây nếu chưa cập nhật file Word. -->

# 4. KIẾN TRÚC HỆ THỐNG

## 4.1 Kiến trúc tổng thể ba tầng

Hệ thống tuân theo kiến trúc ba tầng như SRS mô tả: **Tầng trình bày** (SPA React chạy trên trình duyệt), **Tầng ứng dụng/API** (Nginx, Express API gồm bộ lập lịch node-cron và AI Adapter) và Tầng dữ liệu (MySQL).

***Bảng 10: Trách nhiệm các thành phần***

| **Thành phần** | **Trách nhiệm** | **Giao tiếp** |
| --- | --- | --- |
| React SPA | Hiển thị, validate phía client, quản lý trạng thái giao diện, vẽ biểu đồ | HTTPS JSON tới /api/v1 |
| Nginx | Kết thúc TLS, phục vụ file tĩnh (cache dài hạn), reverse proxy, giới hạn kích thước body và tần suất | HTTP nội bộ tới container api |
| Express API | Xác thực, phân quyền, nghiệp vụ, truy vấn dữ liệu, phát sự kiện | Prisma → MySQL; node-cron cho tác vụ định kỳ |
| AI Adapter | Giao diện thống nhất tới nhà cung cấp LLM, làm sạch PII, cache bộ nhớ (LRU), timeout, kiểm tra đầu ra | HTTPS tới LLM API |
| MySQL | Nguồn dữ liệu chính (source of truth) | Chỉ nhận kết nối từ mạng Docker nội bộ |

***Hình 5: Kiến trúc tổng thể ba tầng*** — ảnh: [images/hinh-5.png](images/hinh-5.png) — mã nguồn sơ đồ: [diagrams/v1_0_Hinh_5.mmd](diagrams/v1_0_Hinh_5.mmd)

## 4.2 Kiến trúc Backend

Backend được tổ chức theo **modular monolith** với các lớp rõ ràng. Mỗi request đi qua chuỗi middleware bảo mật trước khi tới controller (xem sơ đồ cuối mục). Controller chỉ ánh xạ HTTP ↔ DTO; nghiệp vụ nằm ở service; truy cập dữ liệu nằm ở repository và **mọi truy vấn dữ liệu người dùng bắt buộc có điều kiện `user_id`** lấy từ token đã xác thực, không bao giờ lấy từ tham số do client gửi.

***Bảng 11: Cấu trúc mã nguồn Backend (mô tả)***

| **Thư mục / Lớp** | **Nội dung** | **Quy tắc** |
| --- | --- | --- |
| config/ | Đọc và validate biến môi trường khi khởi động | Thiếu biến bắt buộc → dừng khởi động (fail fast) |
| middlewares/ | helmet, cors, rateLimit, requestId, authenticate, authorize, validate, errorHandler | Thứ tự cố định như sơ đồ kiến trúc Backend |
| modules/<tên>/ | routes, controller, service, repository, schema (Zod), types cho từng module | Module không truy cập trực tiếp repository của module khác, chỉ gọi qua service |
| events/ | Event bus nội bộ (EventEmitter) và các handler (BudgetAlert, Anomaly, AiLearning) | Handler idempotent, lỗi handler không làm hỏng request chính |
| jobs/ | Định nghĩa lịch node-cron và các tác vụ định kỳ | Mỗi tác vụ idempotent nhờ ràng buộc UNIQUE; lỗi một người dùng không dừng cả lượt chạy |
| integrations/ | AI Adapter, Mailer, PDF renderer | Mọi lời gọi ra ngoài có timeout và circuit breaker |
| prisma/ | Schema, migration, seed | Migration chỉ tiến (forward-only), review trước khi merge |
| tests/ | Unit, integration, fixture dữ liệu | Chạy trong CI với MySQL service container |

***Hình 6: Kiến trúc lớp và module của Backend*** — ảnh: [images/hinh-6.png](images/hinh-6.png) — mã nguồn sơ đồ: [diagrams/v1_0_Hinh_6.mmd](diagrams/v1_0_Hinh_6.mmd)

## 4.3 Kiến trúc Frontend

Frontend là SPA với ba layout theo vai trò. Route được lazy-load để giảm kích thước bundle ban đầu. Trạng thái máy chủ quản lý bởi TanStack Query; access token chỉ lưu trong bộ nhớ (React Context), không lưu localStorage; tùy chọn giao diện (dark mode, cỡ chữ) lưu localStorage và đồng bộ lên hồ sơ.

- **Axios instance** có interceptor: gắn access token; khi nhận 401 thì gọi /auth/refresh một lần (các request đang chờ được giữ lại và gửi lại sau khi làm mới), thất bại thì đăng xuất.

- **ProtectedRoute** kiểm tra đăng nhập và vai trò; điều hướng về trang đăng nhập tương ứng (sinh viên / admin).

- **Error Boundary** theo từng layout để lỗi một widget không làm trắng toàn trang; lỗi gửi về Sentry (đã lọc PII).

- **Code splitting:** Chart.js và trang Admin chỉ tải khi cần; ảnh dùng định dạng WebP, lazy loading.

***Hình 7: Kiến trúc thành phần Frontend*** — ảnh: [images/hinh-7.png](images/hinh-7.png) — mã nguồn sơ đồ: [diagrams/v1_0_Hinh_7.mmd](diagrams/v1_0_Hinh_7.mmd)

## 4.4 Kiến trúc triển khai

Toàn bộ hệ thống chạy trên một VPS (khuyến nghị 2 vCPU, 4 GB RAM, 80 GB SSD) bằng Docker Compose gồm 3 container: web (Nginx phục vụ SPA, reverse proxy /api, TLS Let's Encrypt), api (Express + node-cron) và mysql. MySQL nằm trong mạng Docker nội bộ, không mở cổng ra ngoài; VPS chỉ mở cổng 80/443 và SSH bằng khóa. Cơ sở dữ liệu được sao lưu hằng ngày bằng mysqldump.

***Bảng 12: Các container triển khai***

| **Container** | **Image** | **Tài nguyên** | **Ghi chú bảo mật** |
| --- | --- | --- | --- |
| nginx | nginx:stable-alpine | 0,25 CPU / 128 MB | Chạy non-root, cấu hình read-only, TLS 1.2+ |
| api | Image nội bộ (node:24-alpine, multi-stage) | 1 CPU / 768 MB | User node, filesystem read-only, không cài công cụ build trong image cuối |
| mysql | mysql:8.4 | 1 CPU / 1,5 GB | Volume dữ liệu riêng, user ứng dụng quyền tối thiểu, không expose cổng |

***Hình 8: Sơ đồ triển khai (Deployment)*** — ảnh: [images/hinh-8.png](images/hinh-8.png) — mã nguồn sơ đồ: [diagrams/v1_0_Hinh_8.mmd](diagrams/v1_0_Hinh_8.mmd)

## 4.5 Xử lý bất đồng bộ và tác vụ nền

***Bảng 13: Danh sách tác vụ nền***

| **Tác vụ** | **Kích hoạt** | **Lịch / Độ trễ** | **Retry** | **Idempotency** |
| --- | --- | --- | --- | --- |
| email.send | Đăng ký, quên mật khẩu, chia sẻ báo cáo | Trong request | 3 lần trong code (Nodemailer) | Token dùng một lần (auth_tokens) |
| recurring.materialize | node-cron | 00:05 hằng ngày | 3 lần | UNIQUE(recurring_rule_id, recurring_period) |
| insight.generate | node-cron / người dùng nhấn "Regenerate" | 00:30 ngày 1 hằng tháng | 3 lần (2s, 8s, 32s) | UNIQUE(user_id, month) – upsert |
| import.parse | Tải lên CSV (xử lý trong request) | Trong request | 1 lần | UNIQUE(user_id, file_sha256) |
| cleanup.expired | node-cron | 03:00 hằng ngày | 3 lần | Xóa token hết hạn, bản nháp import > 24h, soft-delete > 30 ngày |
| backup.database | Cron hệ điều hành | 02:00 hằng ngày | Cảnh báo nếu lỗi | Tên file theo ngày |

## 4.6 Cơ chế sự kiện miền (Domain Events)

Sau khi một giao dịch được tạo, sửa, xóa hoặc khôi phục thành công (đã commit DB), service phát sự kiện nội bộ (EventEmitter) transaction.created | updated | deleted | restored kèm userId, categoryId, tháng và số tiền. Các handler đăng ký độc lập:

- **BudgetAlertHandler** – tính lại mức tiêu thụ ngân sách và tạo thông báo (mục 5.11).

- **AnomalyDetector** – kiểm tra giao dịch bất thường hoặc trùng lặp (mục 5.14).

- **AiLearningHandler** – nếu category_source = ai_overridden, cập nhật luật phân loại cá nhân.

Thiết kế này tách nghiệp vụ lõi khỏi tác vụ phụ, giúp dễ kiểm thử; mẹo tiết kiệm được tính lại khi người dùng mở dashboard nên không cần tác vụ nền riêng.

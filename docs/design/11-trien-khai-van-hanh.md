<!-- Trích từ Tài liệu thiết kế kỹ thuật Campus Coin v1.0 (bản đã sửa). Nguồn gốc: file Word. Không sửa trực tiếp ở đây nếu chưa cập nhật file Word. -->

# 11. TRIỂN KHAI VÀ VẬN HÀNH

## 11.1 Các môi trường

***Bảng 63: Các môi trường***

| **Môi trường** | **Mục đích** | **Dữ liệu** | **Cấu hình đặc thù** |
| --- | --- | --- | --- |
| Local (dev) | Phát triển | Seed demo | Docker Compose dev (MySQL, Mailpit bắt email), hot reload, Swagger bật |
| Demo (host) | Bản trực tuyến cho hội đồng đánh giá | Seed demo 6 tháng | Cấu hình như production; SMTP thật; LLM dùng khóa riêng có quota thấp |
| Production | Người dùng thật | Dữ liệu thật | Swagger tắt, log mức info, backup, giám sát |

## 11.2 Pipeline CI/CD

***Hình 28: Pipeline CI/CD với GitHub Actions*** — ảnh: [images/hinh-28.png](images/hinh-28.png) — mã nguồn sơ đồ: [diagrams/v1_0_Hinh_28.mmd](diagrams/v1_0_Hinh_28.mmd)

## 11.3 Cấu hình môi trường

Ứng dụng đọc cấu hình từ biến môi trường, được validate khi khởi động. Bảng dưới liệt kê tên biến (không kèm giá trị bí mật):

***Bảng 64: Biến môi trường***

| **Nhóm** | **Biến môi trường** | **Mô tả** |
| --- | --- | --- |
| Ứng dụng | NODE_ENV, PORT, APP_URL, API_URL, CORS_ORIGINS, LOG_LEVEL | Môi trường, cổng, URL, origin cho phép |
| Cơ sở dữ liệu | DATABASE_URL, DATABASE_MIGRATOR_URL | Chuỗi kết nối tài khoản ứng dụng / tài khoản migration |
| Xác thực | JWT_PRIVATE_KEY, JWT_PUBLIC_KEY, JWT_KID, ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL, IP_HASH_SECRET | Khóa ký và thời hạn token |
| Email | SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM | Gửi email |
| AI | AI_PROVIDER, AI_API_KEY, AI_MODEL, AI_TIMEOUT_MS, AI_DAILY_QUOTA | Cấu hình LLM qua adapter |
| Giám sát | SENTRY_DSN, SENTRY_ENV | Theo dõi lỗi |
| Frontend | VITE_API_URL, VITE_TAWK_PROPERTY_ID, VITE_TAWK_WIDGET_ID, VITE_SENTRY_DSN | Cấu hình build SPA (không chứa bí mật) |

## 11.4 Hướng dẫn cài đặt

SRS mục 1.9 yêu cầu hướng dẫn cài đặt là bắt buộc. Các bước dưới đây áp dụng cho môi trường local; production dùng pipeline CI/CD.

### 11.4.1 Yêu cầu hệ thống

- Phần cứng theo SRS: Intel Core i5/i7 trở lên, RAM 16 GB, ổ cứng trống ≥ 500 GB (thực tế dự án cần ~5 GB).

- Phần mềm: Git; Docker Desktop (hoặc Docker Engine + Compose v2); tùy chọn Node.js 24 LTS và MySQL 8.4 nếu chạy không dùng Docker; IDE Visual Studio Code.

- Trình duyệt: Chrome, Edge, Firefox, Safari phiên bản mới nhất.

### 11.4.2 Cài đặt bằng Docker (khuyến nghị)

- Giải nén gói nộp dự án (hoặc clone repository) vào thư mục làm việc.

- Sao chép file cấu hình mẫu .env.example thành .env ở thư mục gốc; điền mật khẩu DB, khóa JWT (có script sinh khóa npm run keys:generate), thông tin SMTP (dùng SMTP thật; khi chạy local có thể dùng Mailpit sẵn trong Compose) và khóa AI (bỏ trống để chạy chế độ không AI).

- Khởi động toàn bộ dịch vụ bằng lệnh docker compose up -d --build và chờ các container ở trạng thái healthy.

- Khởi tạo CSDL: docker compose exec api npm run db:migrate rồi docker compose exec api npm run db:seed (tạo danh mục mặc định, mẫu mẹo, tài khoản và dữ liệu demo).

- Truy cập ứng dụng tại http://localhost:8080, cổng quản trị tại http://localhost:8080/admin/login; nếu dùng Mailpit, hộp thư thử nghiệm ở http://localhost:8025.

### 11.4.3 Cài đặt thủ công (không dùng Docker)

- Cài MySQL 8.4; tạo database campus_coin (utf8mb4).

- Hoặc nạp trực tiếp schema và dữ liệu mẫu bằng các file campus_coin_schema.sql và seed.sql trong gói nộp.

- Thư mục backend: cài phụ thuộc bằng npm ci, cấu hình .env (DATABASE_URL trỏ tới MySQL cục bộ), chạy npm run db:migrate, npm run db:seed (bỏ qua nếu đã nạp seed.sql), sau đó npm run dev. Tác vụ định kỳ node-cron chạy cùng tiến trình API nên chỉ cần một terminal cho backend.

- Thư mục frontend: npm ci, cấu hình .env với VITE_API_URL, chạy npm run dev và mở địa chỉ được hiển thị.

### 11.4.4 Triển khai production

- Chuẩn bị VPS Ubuntu 24.04 LTS: tạo user không phải root, chỉ đăng nhập SSH bằng khóa, bật UFW (chỉ 22 từ IP quản trị, 80/443), cài unattended-upgrades.

- Trỏ bản ghi DNS của tên miền về IP của VPS; cấp chứng chỉ Let's Encrypt cho Nginx.

- Cấu hình GitHub Actions secrets; merge vào main để pipeline build image, sao lưu DB, chạy migration, khởi động lại bằng docker compose up -d và smoke test /health.

- Kích hoạt cron sao lưu, UptimeRobot, Sentry; chạy thử quy trình khôi phục trước khi mở cho người dùng.

## 11.5 Tài khoản demo

SRS yêu cầu cung cấp thông tin đăng nhập cho mọi loại người dùng. Các tài khoản sau chỉ được tạo bởi seed demo trên môi trường local và bản demo; **bắt buộc đổi mật khẩu hoặc xóa trước khi đưa vào sử dụng thật**.

***Bảng 65: Tài khoản demo***

| **Vai trò** | **Email đăng nhập** | **Mật khẩu** | **Ghi chú** |
| --- | --- | --- | --- |
| Quản trị viên | admin@campuscoin.demo | Admin@Campus2026! | Đăng nhập tại cổng riêng /admin/login |
| Sinh viên 1 | an.nguyen@campuscoin.demo | Student@Campus2026! | Dữ liệu 6 tháng, AI bật, có ngân sách và nhận định |
| Sinh viên 2 | binh.tran@campuscoin.demo | Student@Campus2026! | Dữ liệu 3 tháng, AI tắt, có giao dịch định kỳ |
| Sinh viên 3 | chi.le@campuscoin.demo | Student@Campus2026! | Tài khoản mới, dùng để demo onboarding và nhập CSV |
| Sinh viên bị khóa | disabled@campuscoin.demo | Student@Campus2026! | Trạng thái disabled – demo không đăng nhập được |

## 11.6 Ma trận tương thích

***Bảng 66: Tương thích trình duyệt và thiết bị***

| **Nền tảng** | **Phiên bản hỗ trợ** | **Kiểm thử** |
| --- | --- | --- |
| Chrome / Edge (Chromium) | 2 phiên bản mới nhất | Kiểm thử thủ công |
| Firefox | 2 phiên bản mới nhất | Kiểm thử thủ công |
| Safari macOS / iOS | Safari 17+ | Kiểm tra thủ công trên Safari và iPhone |
| Android Chrome | Android 11+ | Kiểm tra thủ công, Chrome DevTools device mode |
| Kích thước màn hình | 320px – 2560px | Chrome DevTools device mode: 375, 768, 1280, 1920 |

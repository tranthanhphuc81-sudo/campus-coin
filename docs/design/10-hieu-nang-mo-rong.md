<!-- Trích từ Tài liệu thiết kế kỹ thuật Campus Coin v1.0 (bản đã sửa). Nguồn gốc: file Word. Không sửa trực tiếp ở đây nếu chưa cập nhật file Word. -->

# 10. HIỆU NĂNG, KHẢ NĂNG MỞ RỘNG VÀ TÍNH SẴN SÀNG

## 10.1 Chỉ tiêu hiệu năng

***Bảng 60: Chỉ tiêu hiệu năng***

| **Chỉ số** | **Mục tiêu** | **Cách đo** |
| --- | --- | --- |
| API đọc (danh sách, chi tiết) | p95 < 200 ms | Log thời gian xử lý, DevTools |
| API ghi (tạo/sửa giao dịch) | p95 < 300 ms | DevTools (tab Network) |
| Dashboard summary | < 500 ms | DevTools (tab Network) |
| Gợi ý danh mục | Tầng 1–2 < 50 ms; tầng LLM p95 < 1,5 s | Log AI Adapter |
| Largest Contentful Paint | < 2,5 s trên 4G | Lighthouse, Web Vitals |
| Interaction to Next Paint | < 200 ms | Web Vitals |
| Cumulative Layout Shift | < 0,1 | Web Vitals |
| Bundle JS ban đầu | < 200 KB gzip | Vite build report |
| Sinh PDF báo cáo | < 3 s | Log server |

## 10.2 Chiến lược tối ưu

- **Frontend:** chia nhỏ bundle theo route, lazy-load Chart.js; tree-shaking Bootstrap (chỉ import SCSS module cần dùng); nén Brotli/gzip; tài nguyên có hash cache 1 năm; prefetch dữ liệu dashboard ngay sau đăng nhập; optimistic update khi thêm giao dịch.

- **Backend:** truy vấn tổng hợp bằng SQL (không kéo dữ liệu về rồi tính trong Node); chỉ SELECT cột cần; connection pool Prisma (10 kết nối/instance); gzip phản hồi; nhận định tháng được sinh trước theo lịch node-cron.

- **CSDL:** chỉ mục phủ cho các truy vấn chính (mục 6.4); tránh OFFSET lớn bằng keyset pagination cho danh sách dài; kiểm tra slow query log (> 200 ms).

- **AI:** debounce phía client, cache kết quả, ưu tiên tầng luật cục bộ; gọi LLM theo lô khi nhập CSV.

## 10.3 Chiến lược cache

***Bảng 61: Chiến lược cache***

| **Dữ liệu** | **Nơi cache** | **TTL** | **Vô hiệu hóa** |
| --- | --- | --- | --- |
| Dashboard summary (tháng hiện tại) | Không cache server; truy vấn SQL có chỉ mục | 60 s | Sự kiện giao dịch/ngân sách của người dùng |
| Báo cáo tháng đã kết thúc | TanStack Query (client) | 1 giờ | Sự kiện giao dịch thuộc tháng đó |
| Danh mục (mặc định + cá nhân) | TanStack Query (client) | 10 phút | CRUD danh mục |
| Kết quả phân loại LLM | Bộ nhớ API (LRU) | 7 ngày | Thay đổi danh sách danh mục |
| Thông báo hệ thống đang hiệu lực | TanStack Query (client) | 5 phút | CRUD announcement |
| Tài nguyên tĩnh SPA | Nginx + cache trình duyệt | 1 năm (tên file có hash) | Build mới |
| Dữ liệu API phía client | TanStack Query | staleTime 30 s | invalidateQueries sau mutation |

## 10.4 Khả năng mở rộng

***Bảng 62: Lộ trình mở rộng***

| **Giai đoạn** | **Quy mô** | **Hành động** |
| --- | --- | --- |
| Giai đoạn 1 (hiện tại) | ≤ 10.000 người dùng | 1 VPS, 1 instance API (kèm node-cron), MySQL cùng máy |
| Giai đoạn 2 | ≤ 100.000 người dùng | Tách MySQL sang dịch vụ được quản lý; thêm Redis cho cache và rate limit, chuyển tác vụ nền sang BullMQ; tăng số instance API (stateless) sau load balancer; thêm read replica cho báo cáo |
| Giai đoạn 3 | > 100.000 người dùng | Container orchestration (Kubernetes/ECS) với autoscaling; phân vùng bảng transactions theo năm; tách AI và báo cáo thành service riêng qua hàng đợi sự kiện; CDN cho API công khai |

Các điểm thiết kế hỗ trợ mở rộng ngay từ đầu: API stateless (JWT), phiên lưu DB, tác vụ định kỳ idempotent (có thể chuyển sang hàng đợi mà không đổi logic), module có ranh giới rõ ràng.

## 10.5 Tính sẵn sàng và giám sát

- **Mục tiêu uptime:** ứng dụng chạy liên tục 24/7, được UptimeRobot kiểm tra mỗi phút (SRS yêu cầu 24/7 với thời gian ngừng tối thiểu).

- **Health check:** /health/live (tiến trình sống) và /health/ready (kết nối DB OK); Docker restart policy unless-stopped.

- **Triển khai: migration tương thích ngược;** graceful shutdown (ngừng nhận request, hoàn tất request đang xử lý trong 10 s, đóng kết nối).

- **Suy giảm mềm (graceful degradation):** LLM lỗi → tầng luật/template; SMTP lỗi → thử lại 3 lần rồi báo người dùng.

- **Giám sát:** UptimeRobot ping 1 phút; Sentry cho lỗi frontend/backend; cảnh báo qua email.

- **Bảo trì:** trang bảo trì tĩnh do Nginx phục vụ khi bật cờ; thông báo trước qua announcements.

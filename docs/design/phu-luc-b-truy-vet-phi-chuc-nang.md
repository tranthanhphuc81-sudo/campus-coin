<!-- Trích từ Tài liệu thiết kế kỹ thuật Campus Coin v1.0 (bản đã sửa). Nguồn gốc: file Word. Không sửa trực tiếp ở đây nếu chưa cập nhật file Word. -->

# PHỤ LỤC B. MA TRẬN TRUY VẾT YÊU CẦU PHI CHỨC NĂNG

***Bảng 73: Truy vết yêu cầu phi chức năng***

| **Yêu cầu SRS 1.7** | **Giải pháp thiết kế** | **Mục** |
| --- | --- | --- |
| An toàn sử dụng (không tải xuống độc hại/không cần thiết) | Chỉ tải file do hệ thống sinh khi người dùng yêu cầu; nosniff; CSP; không tải script bên thứ ba không kiểm soát | 9.10, 9.11 |
| Khả năng tiếp cận | WCAG 2.2 AA, dark mode, cỡ chữ, bàn phím, bảng dữ liệu thay biểu đồ | 5.15, 8.5 |
| Thân thiện người dùng | Onboarding 3 bước, quick-add ≤ 3 thao tác, AI tự điền, trạng thái rỗng có hướng dẫn, breadcrumbs | 5.4, 8.3, 8.6 |
| Khả năng vận hành (tin cậy, hiệu quả) | Tác vụ idempotent, retry khi gọi LLM, graceful degradation, health check, backup | 4.5, 10.5, 9.13 |
| Hiệu năng (biểu đồ, nhận định tải nhanh) | Cache phía client, chỉ mục, sinh nhận định trước theo lịch, skeleton, code splitting | 10.1–10.3 |
| Khả năng mở rộng | API stateless, modular monolith, lộ trình mở rộng 3 giai đoạn | 10.4 |
| Bảo mật (chỉ người đăng ký xem được lịch sử của mình) | Xác thực JWT + refresh rotation, RBAC + kiểm tra sở hữu, mã hóa, audit | Chương 9 |
| Sẵn sàng 24/7 | Health check, auto-restart, giám sát uptime, backup hằng ngày | 10.5, 9.13 |
| Tương thích trình duyệt/thiết bị | Bootstrap responsive, kiểm thử đa trình duyệt, ma trận tương thích | 8.4, 11.6 |

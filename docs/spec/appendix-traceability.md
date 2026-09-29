# PHỤ LỤC A. MA TRẬN TRUY VẾT YÊU CẦU CHỨC NĂNG

***Bảng 72: Truy vết yêu cầu chức năng***

| **Yêu cầu SRS 1.6**                                                          | **Mục thiết kế** | **API chính**                               | **Bảng dữ liệu**                                     | **Test**     |
|------------------------------------------------------------------------------|------------------|---------------------------------------------|------------------------------------------------------|--------------|
| Đăng ký, đăng nhập sinh viên; đăng nhập admin riêng                          | 5.1              | /auth/\*, /admin/auth/\*                    | users, refresh_tokens                                | TC-01–04, 08 |
| Quản lý phiên an toàn                                                        | 5.1.2, 9.5       | /auth/refresh, /me/sessions                 | refresh_tokens                                       | TC-04        |
| Khôi phục mật khẩu qua email / token                                         | 5.1.3            | /auth/forgot-password, /auth/reset-password | auth_tokens                                          | TC-05        |
| Hồ sơ: tên, năm học, trợ cấp, mục tiêu tiết kiệm                             | 5.2              | /me                                         | users                                                | –            |
| Nhập CSV lịch sử giao dịch                                                   | 5.5              | /imports/\*                                 | import_batches, transactions                         | TC-18, 19    |
| Danh mục thu/chi mặc định và cá nhân                                         | 5.3              | /categories, /admin/categories              | categories                                           | TC-09, 10    |
| Dashboard: lời chào, số dư, thêm nhanh, tips, Top Category, Budget vs Actual | 5.7              | /dashboard/summary                          | transactions, budgets, user_tips                     | E2E          |
| Quick-add thu/chi                                                            | 5.4.1            | POST /transactions                          | transactions                                         | TC-11        |
| Giao dịch định kỳ                                                            | 5.4.2            | /recurring-rules                            | recurring_rules, transactions                        | TC-14        |
| Sửa/xóa giữ đầy đủ lịch sử                                                   | 5.4.1, 5.4.3     | PATCH/DELETE /transactions, /history        | transaction_history                                  | TC-12, 13    |
| AI gợi ý danh mục, học từ sửa đổi, ghi đè, phân loại hàng loạt CSV           | 5.6              | /ai/\*                                      | ai_category_rules, transactions                      | TC-15–17     |
| Báo cáo danh mục, thu vs chi 6 tháng, ngày/tuần, lọc                         | 5.8              | /reports/\*                                 | transactions                                         | TC-21        |
| Xuất PDF/ảnh                                                                 | 5.8              | /reports/monthly/export                     | –                                                    | TC-21        |
| AI nhận định tháng, flag tăng trưởng, lời khuyên, lưu lịch sử                | 5.9              | /insights/\*                                | insights                                             | TC-22        |
| Tips engine: so với trung bình/ngân sách, xếp hạng, dismiss/pin              | 5.10             | /tips/\*                                    | user_tips, tip_templates                             | TC-23        |
| Ngân sách theo danh mục, progress bar, thông báo                             | 5.11             | /budgets, /notifications                    | budgets, notifications                               | TC-20        |
| Bookmark tip/insight; xuất và chia sẻ email                                  | 5.12             | /bookmarks, /reports/monthly/share          | bookmarks                                            | E2E          |
| Admin: danh mục mặc định, mẫu tip/thông báo, tài khoản, thống kê             | 5.13             | /admin/\*                                   | categories, tip_templates, announcements, audit_logs | TC-07, 08    |
| Giao dịch xem/sửa gần đây                                                    | 5.14             | /activity/recent                            | recent_activity                                      | E2E          |
| Dự báo tháng tới                                                             | 5.14             | /forecast/next-month                        | transactions, recurring_rules                        | Unit         |
| Phát hiện bất thường / trùng lặp                                             | 5.14             | /transactions/{id}/resolve-flag             | transactions                                         | TC-24, 25    |
| Dark mode, cỡ chữ, breadcrumbs, loading indicators                           | 5.15, 8.5, 8.6   | /me (preferences)                           | users.preferences                                    | TC-27        |
| Chatbot hỗ trợ (SRS 1.8)                                                     | 3.4              | – (widget Tawk.to)                          | –                                                    | Thủ công     |
| Sitemap trên trang chủ (SRS 1.9)                                             | 8.1              | –                                           | –                                                    | E2E          |


# PHỤ LỤC B. MA TRẬN TRUY VẾT YÊU CẦU PHI CHỨC NĂNG

***Bảng 73: Truy vết yêu cầu phi chức năng***

| **Yêu cầu SRS 1.7**                                       | **Giải pháp thiết kế**                                                                                          | **Mục**         |
|-----------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------|-----------------|
| An toàn sử dụng (không tải xuống độc hại/không cần thiết) | Chỉ tải file do hệ thống sinh khi người dùng yêu cầu; nosniff; CSP; không tải script bên thứ ba không kiểm soát | 9.10, 9.11      |
| Khả năng tiếp cận                                         | WCAG 2.2 AA, dark mode, cỡ chữ, bàn phím, bảng dữ liệu thay biểu đồ                                             | 5.15, 8.5       |
| Thân thiện người dùng                                     | Onboarding 3 bước, quick-add ≤ 3 thao tác, AI tự điền, trạng thái rỗng có hướng dẫn, breadcrumbs                | 5.4, 8.3, 8.6   |
| Khả năng vận hành (tin cậy, hiệu quả)                     | Job idempotent, retry, graceful degradation, health check, backup                                               | 4.5, 10.5, 9.13 |
| Hiệu năng (biểu đồ, nhận định tải nhanh)                  | Cache Redis, chỉ mục, sinh nhận định trước theo lịch, skeleton, code splitting                                  | 10.1–10.3       |
| Khả năng mở rộng                                          | API stateless, modular monolith, queue, lộ trình mở rộng 3 giai đoạn                                            | 10.4            |
| Bảo mật (chỉ người đăng ký xem được lịch sử của mình)     | Xác thực JWT + refresh rotation, RBAC + kiểm tra sở hữu, mã hóa, audit                                          | Chương 9        |
| Sẵn sàng 24/7                                             | 2 instance API, rolling update, giám sát uptime, RPO 15 phút/RTO 4 giờ                                          | 10.5, 9.13      |
| Tương thích trình duyệt/thiết bị                          | Bootstrap responsive, kiểm thử Playwright đa trình duyệt, ma trận tương thích                                   | 8.4, 11.6       |


# PHỤ LỤC C. DANH MỤC SƠ ĐỒ VÀ SẢN PHẨM BÀN GIAO

Theo SRS mục 1.9, gói nộp dự án gồm các thành phần sau; tài liệu này cung cấp phần Thiết kế (Design Specifications), Sơ đồ, Thiết kế CSDL, Dữ liệu kiểm thử, Hướng dẫn cài đặt và Tài khoản người dùng.

***Bảng 74: Sản phẩm bàn giao theo SRS***

| **Sản phẩm bàn giao**                | **Nội dung**                                                                                             | **Vị trí trong tài liệu / gói nộp**   |
|--------------------------------------|----------------------------------------------------------------------------------------------------------|---------------------------------------|
| Problem Definition                   | Bài toán, mục tiêu, phạm vi                                                                              | Chương 1, 2                           |
| Design Specifications                | Kiến trúc, chức năng, API, giao diện, bảo mật                                                            | Chương 3–9                            |
| Diagrams (Flowchart, DFD…)           | Use case, ngữ cảnh, DFD mức 0/1, kiến trúc, triển khai, tuần tự, lưu đồ, trạng thái, ERD, sitemap, CI/CD | Xuyên suốt tài liệu                   |
| Database Design                      | ERD, từ điển dữ liệu, chỉ mục                                                                            | Chương 6; file campus_coin_schema.sql |
| Test Data                            | Bộ dữ liệu kiểm thử                                                                                      | Mục 12.3; seed.sql, file CSV mẫu      |
| Installation Instructions (bắt buộc) | Cài đặt Docker/thủ công/production                                                                       | Mục 11.4                              |
| User Credentials (bắt buộc)          | Tài khoản admin và sinh viên                                                                             | Mục 11.5                              |
| ReadMe.doc                           | Giả định, hướng dẫn nhanh                                                                                | Gói nộp (tham chiếu mục 1.6)          |
| Video demo (.mp4, bắt buộc)          | Trình diễn toàn bộ chức năng                                                                             | Gói nộp                               |
| URL ứng dụng                         | Bản triển khai trực tuyến                                                                                | Gói nộp                               |


# PHỤ LỤC D. KHAI BÁO SỬ DỤNG CÔNG CỤ AI

SRS yêu cầu khai báo mọi công cụ AI được sử dụng và nhấn mạnh AI chỉ là trợ lý. Nhóm điền bảng dưới đây trước khi nộp:

***Bảng 75: Khai báo công cụ AI***

| **Công cụ AI**                       | **Mục đích sử dụng**                                       | **Phạm vi / Mức độ**                                   | **Người kiểm duyệt** |
|--------------------------------------|------------------------------------------------------------|--------------------------------------------------------|----------------------|
| (Ví dụ) Claude / ChatGPT             | Tham khảo, rà soát cấu trúc tài liệu thiết kế, gợi ý sơ đồ | Nhóm tự chỉnh sửa, kiểm chứng và hiểu toàn bộ nội dung | …                    |
| (Ví dụ) GitHub Copilot               | Gợi ý mã lặp lại, viết test                                | Mọi đoạn mã được review, sửa đổi và giải thích được    | …                    |
| (Ví dụ) Figma AI / Canva AI          | Phác thảo ý tưởng giao diện, hình minh họa                 | Thiết kế cuối do nhóm tự hoàn thiện                    | …                    |
| Gemini / OpenAI API (trong sản phẩm) | Tính năng phân loại và nhận định của ứng dụng              | Theo thiết kế mục 3.4, 5.6, 5.9                        | …                    |

> **Lưu ý:** Tài liệu này là bản thiết kế tham chiếu. Nhóm phát triển cần xem xét, điều chỉnh theo hiện thực thực tế và có khả năng giải thích mọi quyết định thiết kế trước hội đồng đánh giá theo yêu cầu của SRS.

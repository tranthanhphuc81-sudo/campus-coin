<!-- Trích từ Tài liệu thiết kế kỹ thuật Campus Coin v1.0 (bản đã sửa). Nguồn gốc: file Word. Không sửa trực tiếp ở đây nếu chưa cập nhật file Word. -->

# 1. GIỚI THIỆU

## 1.1 Mục đích tài liệu

Tài liệu Thiết kế Kỹ thuật (Technical Design Document – TDD) này chuyển hóa các yêu cầu trong tài liệu Đặc tả Yêu cầu Phần mềm (SRS) **Campus Coin – Smart Spending, Student Style** (Theme: NextGen BudgetBee, Category: End-to-End Web Solutions, phiên bản 1.0) thành một bản thiết kế có thể triển khai trực tiếp. Tài liệu mô tả kiến trúc hệ thống, lựa chọn công nghệ, thiết kế chức năng chi tiết, thiết kế cơ sở dữ liệu, hợp đồng API, thiết kế giao diện, các biện pháp bảo mật và an toàn dữ liệu, chiến lược kiểm thử, triển khai và vận hành.

Tài liệu là căn cứ thống nhất cho đội phát triển (frontend, backend, QA, DevOps) khi xây dựng sản phẩm, đồng thời là tài liệu giải trình thiết kế trước hội đồng đánh giá. Theo yêu cầu của SRS (mục 1.9), tài liệu **không chứa mã nguồn**; mọi thiết kế được trình bày bằng sơ đồ, bảng và mô tả.

## 1.2 Phạm vi hệ thống

Campus Coin là ứng dụng web full-stack, responsive, giúp sinh viên cao đẳng/đại học ghi nhận thu nhập và chi tiêu, phân loại chi tiêu theo danh mục, đặt ngân sách, theo dõi xu hướng và nhận mẹo tiết kiệm cá nhân hóa. Phạm vi thiết kế bao gồm:

- **Trong phạm vi:** đăng ký/đăng nhập, quản lý phiên, khôi phục mật khẩu; hồ sơ người dùng; quản lý danh mục; ghi nhận thu/chi (kể cả giao dịch định kỳ và nhập CSV); trợ lý phân loại AI; dashboard; báo cáo và xuất PDF/ảnh; nhận định AI hằng tháng; engine mẹo tiết kiệm; ngân sách và cảnh báo; bookmark, ghi chú, chia sẻ qua email; cổng quản trị; tính năng trí tuệ hệ thống (giao dịch gần đây, dự báo, phát hiện bất thường/trùng lặp); khả năng tiếp cận (dark mode, cỡ chữ, breadcrumbs); chatbot hỗ trợ; sitemap.

- **Ngoài phạm vi (theo SRS 1.5):** tích hợp ngân hàng thật, xác minh tài khoản ngân hàng, xử lý thanh toán hoặc giao dịch tiền thật. Mọi gợi ý AI chỉ mang tính tham khảo, không phải tư vấn tài chính được chứng nhận.

## 1.3 Đối tượng sử dụng tài liệu

***Bảng 1: Đối tượng sử dụng tài liệu***

| **Đối tượng** | **Mục đích sử dụng** | **Các chương cần đọc** |
| --- | --- | --- |
| Trưởng nhóm / Kiến trúc sư | Nắm kiến trúc, quyết định công nghệ, rủi ro | Toàn bộ, trọng tâm 3, 4, 9, 10 |
| Lập trình viên Backend | Hiện thực API, nghiệp vụ, CSDL, job nền | 4, 5, 6, 7, 9 |
| Lập trình viên Frontend | Hiện thực giao diện, luồng người dùng, gọi API | 5, 7, 8 |
| Kiểm thử viên (QA) | Thiết kế kịch bản kiểm thử, dữ liệu kiểm thử | 5, 7, 12, Phụ lục A |
| DevOps | Hạ tầng, CI/CD, sao lưu, giám sát | 4.4, 9.13, 10, 11 |
| Hội đồng đánh giá | Đánh giá mức độ đáp ứng SRS | 2, 3, 9, Phụ lục A, B |

## 1.4 Thuật ngữ và từ viết tắt

***Bảng 2: Thuật ngữ và từ viết tắt***

| **Thuật ngữ** | **Giải thích** |
| --- | --- |
| SRS | Software Requirements Specification – Đặc tả yêu cầu phần mềm |
| TDD | Technical Design Document – Tài liệu thiết kế kỹ thuật (tài liệu này) |
| SPA | Single Page Application – ứng dụng web một trang |
| API / REST | Giao diện lập trình ứng dụng theo kiến trúc REST, trao đổi JSON qua HTTPS |
| JWT | JSON Web Token – mã thông báo truy cập có chữ ký số |
| Access token / Refresh token | Token truy cập ngắn hạn (15 phút) / token làm mới dài hạn (7–30 ngày) lưu trong cookie HttpOnly |
| RBAC | Role-Based Access Control – phân quyền theo vai trò |
| IDOR | Insecure Direct Object Reference – lỗ hổng truy cập đối tượng của người khác qua ID |
| LLM | Large Language Model – mô hình ngôn ngữ lớn dùng cho phân loại và sinh nhận định |
| PII | Personally Identifiable Information – dữ liệu định danh cá nhân |
| ORM | Object-Relational Mapping – ánh xạ đối tượng – quan hệ (Prisma) |
| RPO / RTO | Recovery Point / Time Objective – lượng dữ liệu tối đa có thể mất / thời gian khôi phục tối đa |
| Soft delete | Xóa mềm: đánh dấu deleted_at thay vì xóa vật lý, cho phép khôi phục |
| Merchant key | Chuỗi mô tả giao dịch đã chuẩn hóa (chữ thường, bỏ dấu, bỏ số) dùng để học phân loại |
| Insight | Nhận định chi tiêu hằng tháng do AI/engine thống kê sinh ra |
| Tip | Mẹo tiết kiệm cá nhân hóa do engine quy tắc sinh ra |

## 1.5 Tài liệu tham chiếu

- SRS Campus Coin – End-to-End Web Solutions, phiên bản 1.0, Aptech Limited.

- OWASP Top 10, OWASP ASVS 4.0 (Application Security Verification Standard) và OWASP Cheat Sheet Series (Password Storage, Session Management, CSRF, File Upload).

- NIST SP 800-63B – Hướng dẫn xác thực số (chính sách mật khẩu).

- WCAG 2.2 mức AA – Hướng dẫn khả năng tiếp cận nội dung web.

- RFC 9457 (Problem Details for HTTP APIs), RFC 6265 (HTTP Cookies).

## 1.6 Giả định và ràng buộc thiết kế

***Bảng 3: Giả định và ràng buộc***

| **Mã** | **Giả định / Ràng buộc** | **Ảnh hưởng tới thiết kế** |
| --- | --- | --- |
| C-01 | Không tích hợp ngân hàng; dữ liệu nhập tay hoặc nhập CSV | Tập trung vào UX nhập nhanh, module import CSV an toàn |
| C-02 | Tương thích trình duyệt hiện đại, responsive desktop/tablet/mobile | Bootstrap 5 grid, mobile-first, kiểm thử đa trình duyệt |
| C-03 | AI là tính năng tùy chọn, chỉ mang tính gợi ý | Kiến trúc AI dạng adapter, có fallback không dùng AI; người dùng luôn ghi đè được |
| C-04 | Tài liệu dự án không chứa mã nguồn | Mô tả thiết kế bằng sơ đồ và bảng |
| C-05 | Công nghệ phải nằm trong danh sách gợi ý của SRS 1.8 | Chọn React + Node.js/Express + MySQL (xem chương 3) |
| A-01 | Mỗi người dùng có một đơn vị tiền tệ chính (mặc định USD, hỗ trợ VND) | Lưu currency ở cấp người dùng và giao dịch, không quy đổi tỷ giá |
| A-02 | Quy mô ban đầu: ~5.000 người dùng, ~100 giao dịch/người/tháng | Một VPS + MySQL đơn là đủ; thiết kế sẵn lộ trình mở rộng ngang |
| A-03 | Múi giờ mặc định Asia/Ho_Chi_Minh, người dùng tự đổi được | Lưu thời điểm theo UTC; txn_date là ngày địa phương |
| A-04 | Toàn bộ giao diện và nội dung hệ thống bằng tiếng Anh (American English) | Chuỗi UI tập trung một nơi; email, PDF, mẫu mẹo, nhận định AI, dữ liệu demo đều tiếng Anh; dữ liệu người dùng nhập có dấu tiếng Việt vẫn được lưu và hiển thị đúng (utf8mb4, font có glyph tiếng Việt) |

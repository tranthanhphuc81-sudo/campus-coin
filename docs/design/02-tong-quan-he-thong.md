<!-- Trích từ Tài liệu thiết kế kỹ thuật Campus Coin v1.0 (bản đã sửa). Nguồn gốc: file Word. Không sửa trực tiếp ở đây nếu chưa cập nhật file Word. -->

# 2. TỔNG QUAN HỆ THỐNG

## 2.1 Bài toán và mục tiêu thiết kế

Sinh viên nhận tiền từ nhiều nguồn không đều đặn (trợ cấp gia đình, việc làm thêm, học bổng, quà tặng) nhưng hiếm khi theo dõi chi tiêu. Các ứng dụng tài chính phổ thông thiết kế cho người đi làm có lương cố định, thường phức tạp hoặc thu phí. Campus Coin giải quyết khoảng trống này với các mục tiêu thiết kế sau:

***Bảng 4: Mục tiêu thiết kế***

| **Mục tiêu** | **Chỉ số đo lường** | **Giải pháp thiết kế chính** |
| --- | --- | --- |
| Nhập giao dịch cực nhanh | ≤ 10 giây / giao dịch; ≤ 3 thao tác | Quick-add modal, AI tự điền danh mục, phím tắt, nhớ danh mục gần nhất |
| Hiểu chi tiêu tức thì | Dashboard tải < 2 giây | Truy vấn tổng hợp có chỉ mục, cache phía client (TanStack Query), biểu đồ Chart.js |
| Lời khuyên cá nhân hóa, dễ làm theo | Tỷ lệ tip được pin/bookmark | Tips engine dựa trên quy tắc + chấm điểm theo tác động tiết kiệm |
| An toàn dữ liệu tài chính cá nhân | 0 lỗ hổng mức High theo npm audit | Phòng thủ nhiều lớp, phân quyền theo sở hữu, mã hóa, audit log |
| Sẵn sàng 24/7 | Health check, tự khởi động lại, giám sát UptimeRobot | 1 instance API, health check, auto-restart, backup DB hằng ngày, giám sát |
| Dễ mở rộng | Thêm tính năng không phá vỡ module khác | Modular monolith, sự kiện nội bộ, tác vụ định kỳ node-cron |

## 2.2 Các tác nhân của hệ thống

***Bảng 5: Các tác nhân***

| **Tác nhân** | **Loại** | **Mô tả và quyền hạn** |
| --- | --- | --- |
| Khách (Guest) | Con người | Xem trang giới thiệu, sitemap, đăng ký, đăng nhập, quên mật khẩu |
| Sinh viên (Student) | Con người | Toàn quyền trên dữ liệu tài chính của chính mình: giao dịch, danh mục riêng, ngân sách, báo cáo, nhận định, mẹo, bookmark, hồ sơ |
| Quản trị viên (Admin) | Con người | Đăng nhập qua cổng riêng /admin/login; quản lý danh mục mặc định, mẫu mẹo, thông báo hệ thống, tài khoản người dùng (xem, vô hiệu hóa, gửi link reset); xem thống kê tổng hợp. **Không** xem được chi tiết giao dịch cá nhân |
| Dịch vụ AI (LLM API) | Hệ thống ngoài | Nhận dữ liệu đã làm sạch/ẩn danh, trả về gợi ý danh mục và văn bản nhận định |
| Dịch vụ Email (SMTP) | Hệ thống ngoài | Gửi email xác minh, đặt lại mật khẩu, báo cáo chia sẻ |
| Bộ lập lịch (Scheduler) | Hệ thống nội bộ | Kích hoạt giao dịch định kỳ, sinh nhận định hằng tháng, dọn dẹp dữ liệu hết hạn, sao lưu |

## 2.3 Sơ đồ Use Case

Sơ đồ dưới đây tổng hợp các ca sử dụng chính theo SRS mục 1.6. Hai ca "Ghi thu/chi" và "Nhập CSV" đều bao hàm (include) ca "Nhận gợi ý phân loại AI".

***Hình 1: Sơ đồ Use Case tổng quát của Campus Coin*** — ảnh: [images/hinh-1.png](images/hinh-1.png)

## 2.4 Sơ đồ ngữ cảnh hệ thống

***Hình 2: Sơ đồ ngữ cảnh (System Context)*** — ảnh: [images/hinh-2.png](images/hinh-2.png) — mã nguồn sơ đồ: [diagrams/v1_0_Hinh_2.mmd](diagrams/v1_0_Hinh_2.mmd)

Mọi trao đổi với hệ thống ngoài đều qua HTTPS/TLS. Dữ liệu gửi tới LLM được làm sạch PII và tối thiểu hóa; email không chứa đường dẫn công khai tới dữ liệu tài chính; bản sao lưu được mã hóa trước khi rời máy chủ.

## 2.5 Sơ đồ luồng dữ liệu (DFD)

### 2.5.1 DFD mức 0 (mức ngữ cảnh)

***Hình 3: DFD mức 0 – Campus Coin*** — ảnh: [images/hinh-3.png](images/hinh-3.png)

### 2.5.2 DFD mức 1

DFD mức 1 phân rã hệ thống thành 7 tiến trình chính và 6 kho dữ liệu. Tiến trình 3.0 (Phân loại AI) và 6.0 (Nhận định & Mẹo) là hai điểm duy nhất gửi dữ liệu ra ngoài tới dịch vụ AI, và cả hai đều đi qua bước làm sạch dữ liệu.

***Bảng 6: Mô tả tiến trình DFD mức 1***

| **Tiến trình** | **Đầu vào** | **Xử lý** | **Đầu ra / Kho dữ liệu** |
| --- | --- | --- | --- |
| 1.0 Xác thực & Hồ sơ | Thông tin đăng ký, đăng nhập, hồ sơ | Xác minh email, băm mật khẩu, cấp/thu hồi token | D1 Users/Sessions |
| 2.0 Quản lý giao dịch | Giao dịch thủ công, định kỳ, CSV | Validate, lưu, ghi lịch sử, phát sự kiện | D2 Transactions/History |
| 3.0 Phân loại AI | Mô tả giao dịch | Luật cá nhân → từ khóa → LLM; học từ sửa đổi | D3 Categories/AI rules |
| 4.0 Ngân sách & Cảnh báo | Sự kiện giao dịch, ngân sách | Tính % tiêu thụ, chống trùng cảnh báo | D4 Budgets/Notifications |
| 5.0 Báo cáo & Xuất file | Bộ lọc thời gian/danh mục | Tổng hợp, dựng biểu đồ, sinh PDF | Báo cáo, file PDF/PNG, email |
| 6.0 Nhận định & Mẹo | Số liệu tổng hợp, ngân sách, mục tiêu | Thống kê tăng trưởng, chấm điểm tip, gọi LLM | D5 Insights/Tips |
| 7.0 Quản trị | Lệnh của admin | CRUD danh mục mặc định, mẫu mẹo, quản lý tài khoản | D1, D3, D5, D6 Audit logs |

***Hình 4: DFD mức 1 – Phân rã tiến trình và kho dữ liệu*** — ảnh: [images/hinh-4.png](images/hinh-4.png)

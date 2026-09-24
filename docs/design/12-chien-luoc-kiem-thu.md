<!-- Trích từ Tài liệu thiết kế kỹ thuật Campus Coin v1.0 (bản đã sửa). Nguồn gốc: file Word. Không sửa trực tiếp ở đây nếu chưa cập nhật file Word. -->

# 12. CHIẾN LƯỢC KIỂM THỬ

## 12.1 Các cấp kiểm thử và công cụ

***Bảng 67: Các cấp kiểm thử***

| **Cấp** | **Phạm vi** | **Công cụ** | **Mục tiêu** |
| --- | --- | --- | --- |
| Unit test | Service, thuật toán tips, dự báo, phát hiện bất thường, chuẩn hóa merchant key, validate | Vitest | Các thuật toán chính đều có test; báo cáo độ phủ bằng vitest --coverage |
| Integration test | API + DB thật (MySQL container), phân quyền, cross-tenant | Vitest + Supertest | Mọi endpoint có ít nhất 1 test thành công + 1 test từ chối |
| Component test | Form giao dịch, bộ lọc, widget | React Testing Library | Hành vi chính của UI |
| Kiểm thử luồng | Luồng người dùng trọn vẹn trên trình duyệt | Kiểm thử thủ công theo kịch bản trên Chrome, Firefox, Edge | 15 kịch bản chính xanh trước mỗi lần triển khai |
| Accessibility | Các trang chính | Lighthouse + kiểm tra thủ công | 0 lỗi mức serious/critical |
| Hiệu năng | Dashboard, danh sách, tạo giao dịch | DevTools, Lighthouse | Đạt chỉ tiêu mục 10.1 |
| Bảo mật | OWASP Top 10, header, cấu hình | npm audit, kiểm thử thủ công | 0 lỗ hổng High/Critical |
| UAT | Sinh viên thật dùng thử | Kịch bản UAT, khảo sát | Nhập giao dịch đầu tiên < 60 s với người mới |

## 12.2 Test case tiêu biểu

***Bảng 68: Test case tiêu biểu***

| **Mã** | **Chức năng** | **Kịch bản** | **Kết quả mong đợi** |
| --- | --- | --- | --- |
| TC-01 | Đăng ký | Đăng ký email mới hợp lệ | 202; email xác minh được gửi qua SMTP; tài khoản pending |
| TC-02 | Đăng ký | Đăng ký email đã tồn tại | 202 với thông điệp chung giống TC-01 (không lộ email) |
| TC-03 | Đăng nhập | Sai mật khẩu 5 lần | Lần 6 bị khóa 15 phút, email cảnh báo, audit auth.locked |
| TC-04 | Phiên | Dùng lại refresh token cũ sau khi đã xoay vòng | 401; toàn bộ phiên của family bị thu hồi |
| TC-05 | Reset mật khẩu | Dùng link reset lần 2 hoặc sau 30 phút | Từ chối; yêu cầu gửi lại link |
| TC-06 | Phân quyền | Sinh viên A GET/PATCH/DELETE giao dịch của B | 404 cho cả ba thao tác, dữ liệu B không đổi |
| TC-07 | Phân quyền | Sinh viên gọi /admin/users | 403 |
| TC-08 | Admin | Đăng nhập admin sai mật khẩu 5 lần | 401; tài khoản bị khóa tạm 15 phút; audit admin.login.failed |
| TC-09 | Danh mục | Tạo danh mục trùng tên cùng loại | 409 |
| TC-10 | Danh mục | Xóa danh mục có giao dịch, chọn danh mục thay thế | Giao dịch chuyển sang danh mục mới trong 1 transaction |
| TC-11 | Giao dịch | Tạo chi tiêu số tiền 0 hoặc âm | 422 lỗi trường amount |
| TC-12 | Giao dịch | Hai tab cùng sửa một giao dịch | Tab lưu sau nhận 409 version-mismatch |
| TC-13 | Lịch sử | Sửa rồi xóa giao dịch | History có 3 bản ghi create/update/delete; khôi phục được |
| TC-14 | Định kỳ | Rule hằng tháng ngày 31, chạy tháng 2 | Sinh giao dịch ngày 28/29; chạy job 2 lần không sinh trùng |
| TC-15 | AI | Nhập "Campus Cafe" lần đầu (AI bật) | Gợi ý Food, nhãn Gợi ý AI |
| TC-16 | AI | Sửa gợi ý sang Entertainment, nhập lại cùng mô tả | Lần sau gợi ý Entertainment (luật cá nhân, tin cậy ≥ 0,8) |
| TC-17 | AI | LLM timeout / khóa API sai | Giao dịch vẫn lưu được; không gợi ý; lỗi log ở server |
| TC-18 | CSV | File 3 MB hoặc file .exe đổi tên .csv | 413 / 415, không lưu gì |
| TC-19 | CSV | Ô mô tả chứa "=HYPERLINK(...)", xuất lại CSV | Ô được thêm tiền tố nháy đơn khi xuất |
| TC-20 | Ngân sách | Chi làm tiêu thụ đạt 85% rồi 105% | 2 thông báo NEAR_LIMIT và EXCEEDED, mỗi loại 1 lần |
| TC-21 | Báo cáo | Xuất PDF tháng có tên/mô tả chứa dấu tiếng Việt | PDF hiển thị đúng dấu, số liệu khớp báo cáo trên màn hình |
| TC-22 | Nhận định | Food tăng 40% so với TB 3 tháng | Nhận định flag Food +40%, có lời khuyên hạn mức tuần |
| TC-23 | Tips | Dismiss một tip | Tip không xuất hiện lại trong 30 ngày |
| TC-24 | Bất thường | Chi 500 USD ở danh mục thường ~10 USD | Giao dịch bị gắn cờ is_anomaly, thông báo xác nhận |
| TC-25 | Trùng lặp | Tạo 2 giao dịch giống hệt trong 2 phút | Giao dịch thứ 2 gắn cờ nghi trùng |
| TC-26 | XSS | Mô tả chứa thẻ script | Hiển thị như văn bản, không thực thi |
| TC-27 | Giao diện | Bật dark mode, cỡ chữ 130%, màn hình 375px | Không vỡ bố cục, tương phản đạt AA |
| TC-28 | Rate limit | Gọi /auth/forgot-password 4 lần/giờ | Lần 4 nhận 429 kèm Retry-After |

## 12.3 Dữ liệu kiểm thử

SRS yêu cầu trình bày dữ liệu kiểm thử sử dụng. Bộ dữ liệu được sinh bằng script seed có tham số cố định (deterministic) để kết quả tái lập được:

***Bảng 69: Bộ dữ liệu kiểm thử***

| **Bộ dữ liệu** | **Nội dung** | **Mục đích** |
| --- | --- | --- |
| Hồ sơ "An" (chi tiêu đều) | 6 tháng, ~90 giao dịch/tháng; trợ cấp 300 USD/tháng; ngân sách Food 90, Transport 30 | Kiểm thử dashboard, báo cáo, dự báo |
| Hồ sơ "Bình" (biến động) | 3 tháng; tháng cuối Food tăng 40%, Entertainment tăng 60%; 4 gói subscription | Kiểm thử nhận định, tips R2/R4 |
| Hồ sơ "Chi" (người mới) | Không có giao dịch | Onboarding, trạng thái rỗng, nhập CSV |
| File CSV hợp lệ | 200 dòng, 3 định dạng ngày, mô tả tiếng Anh, vài dòng có dấu tiếng Việt | Nhập và phân loại hàng loạt |
| File CSV lỗi | Dòng thiếu cột, số tiền chữ, ngày sai, ô chứa công thức, dòng trùng | Kiểm tra validate và báo cáo lỗi |
| Mô tả phân loại | 100 mô tả có nhãn đúng (Campus Cafe→Food, Grab→Transport, Netflix→Subscriptions…) | Đo độ chính xác phân loại (mục tiêu ≥ 85%) |
| Dữ liệu tải | 5.000 người dùng × 12 tháng × 80 giao dịch (~4,8 triệu bản ghi) | Kiểm thử hiệu năng, chỉ mục |

## 12.4 Tiêu chí hoàn thành (Definition of Done)

- Chức năng đáp ứng tiêu chí chấp nhận và có mặt trong ma trận truy vết (Phụ lục A).

- Unit/integration test viết kèm và pass; không giảm độ phủ; kịch bản kiểm thử luồng liên quan đạt.

- Code review bởi ít nhất 1 thành viên; lint và type-check sạch; không có cảnh báo bảo mật mới.

- Giao diện responsive, đạt kiểm tra accessibility, có trạng thái loading/empty/error.

- Tài liệu (TDD, OpenAPI, README) được cập nhật.

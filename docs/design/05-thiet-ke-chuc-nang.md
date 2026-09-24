<!-- Trích từ Tài liệu thiết kế kỹ thuật Campus Coin v1.0 (bản đã sửa). Nguồn gốc: file Word. Không sửa trực tiếp ở đây nếu chưa cập nhật file Word. -->

# 5. THIẾT KẾ CHỨC NĂNG CHI TIẾT

Chương này mô tả thiết kế chi tiết cho từng nhóm yêu cầu chức năng trong SRS mục 1.6. Mỗi chức năng gồm: mô tả, quy tắc nghiệp vụ (BR), luồng xử lý và các ràng buộc kiểm tra dữ liệu. Ma trận truy vết đầy đủ nằm ở Phụ lục A.

## 5.1 Xác thực và quản lý người dùng

### 5.1.1 Đăng ký và xác minh email

Sinh viên đăng ký bằng họ tên, email và mật khẩu. Tài khoản ở trạng thái pending cho tới khi xác minh email (email gửi qua dịch vụ SMTP thật để luồng này chạy được trên bản host) qua liên kết chứa token dùng một lần. Khi tạo tài khoản, hệ thống không sao chép danh mục mặc định mà tham chiếu tới danh mục hệ thống (user_id = NULL), nhờ đó admin cập nhật danh mục mặc định sẽ áp dụng cho mọi người dùng.

### 5.1.2 Đăng nhập và quản lý phiên

Sinh viên đăng nhập tại /login; quản trị viên đăng nhập tại cổng riêng /admin/login (SRS: "separate, direct-access administrator login"). Phiên làm việc dùng cặp access token (JWT, 15 phút, chỉ giữ trong bộ nhớ) và refresh token (chuỗi ngẫu nhiên 256-bit, lưu dạng băm SHA-256 trong DB, gửi qua cookie HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth). Refresh token được **xoay vòng** mỗi lần dùng; nếu một token cũ bị dùng lại, toàn bộ "họ" token bị thu hồi vì đó là dấu hiệu bị đánh cắp.

### 5.1.3 Quên và đặt lại mật khẩu

Người dùng nhập email tại trang Quên mật khẩu; hệ thống luôn trả cùng một thông điệp dù email có tồn tại hay không. Nếu tài khoản tồn tại, một token ngẫu nhiên 256-bit được sinh, chỉ lưu giá trị băm SHA-256, hết hạn sau 30 phút và vô hiệu hóa các token cũ. Sau khi đặt mật khẩu mới, mọi phiên đăng nhập bị thu hồi và người dùng nhận email thông báo.

***Bảng 14: Quy tắc nghiệp vụ – Xác thực***

| **Mã** | **Quy tắc nghiệp vụ** |
| --- | --- |
| BR-AU-01 | Email là duy nhất, được chuẩn hóa chữ thường và cắt khoảng trắng; tối đa 254 ký tự. |
| BR-AU-02 | Mật khẩu 10–128 ký tự, không bắt buộc ký tự đặc biệt nhưng bị từ chối nếu nằm trong danh sách mật khẩu phổ biến/bị lộ (NIST 800-63B); hiển thị thanh đo độ mạnh. |
| BR-AU-03 | Thông báo lỗi đăng nhập/đăng ký/quên mật khẩu là thông điệp chung, không tiết lộ email có tồn tại hay không. |
| BR-AU-04 | Sai mật khẩu 5 lần liên tiếp → khóa đăng nhập 15 phút (tăng dần: 15 → 30 → 60 phút) và gửi email cảnh báo. |
| BR-AU-05 | Token xác minh email hết hạn sau 24 giờ; token đặt lại mật khẩu hết hạn sau 30 phút; cả hai dùng một lần. |
| BR-AU-06 | Đặt lại/đổi mật khẩu thành công → thu hồi toàn bộ refresh token (đăng xuất mọi thiết bị) và gửi email thông báo. |
| BR-AU-07 | Tùy chọn "Remember me": refresh token 30 ngày; mặc định 7 ngày. Phiên admin: refresh 8 giờ, tự đăng xuất khi không hoạt động 30 phút. |
| BR-AU-08 | Tài khoản disabled không đăng nhập được; mọi refresh token bị thu hồi ngay khi admin vô hiệu hóa. |
| BR-AU-09 | Người dùng xem được danh sách phiên đăng nhập (thiết bị, thời gian) và đăng xuất từng phiên hoặc tất cả. |

### 5.1.4 Sơ đồ tuần tự các luồng xác thực

Ba sơ đồ dưới đây mô tả chi tiết thứ tự tương tác giữa trình duyệt, API, cơ sở dữ liệu và dịch vụ email cho các luồng đăng ký, đăng nhập/làm mới phiên và đặt lại mật khẩu.

***Hình 9: Sơ đồ tuần tự – Đăng ký và xác minh email*** — mã nguồn Mermaid: [diagrams/v1_0_Hinh_9.mmd](diagrams/v1_0_Hinh_9.mmd); ảnh: [images/hinh-9.png](images/hinh-9.png)

***Hình 10: Sơ đồ tuần tự – Đăng nhập, gọi API và làm mới token*** — mã nguồn Mermaid: [diagrams/v1_0_Hinh_10.mmd](diagrams/v1_0_Hinh_10.mmd); ảnh: [images/hinh-10.png](images/hinh-10.png)

***Hình 11: Sơ đồ tuần tự – Quên mật khẩu và đặt lại qua liên kết token*** — ảnh: [images/hinh-11.png](images/hinh-11.png)

## 5.2 Hồ sơ người dùng

Hồ sơ gồm các trường có thể chỉnh sửa theo SRS: họ tên, năm học, mức trợ cấp cơ sở hằng tháng (monthly_allowance_baseline), mục tiêu tiết kiệm hằng tháng; bổ sung: đơn vị tiền tệ, múi giờ, tùy chọn giao diện (dark mode, cỡ chữ) và đồng ý sử dụng AI (ai_opt_in).

***Bảng 15: Trường dữ liệu hồ sơ***

| **Trường** | **Kiểu / Ràng buộc** | **Ghi chú** |
| --- | --- | --- |
| Họ tên | Chuỗi 2–100 ký tự, loại bỏ thẻ HTML | Dùng cho lời chào cá nhân hóa trên dashboard |
| Năm học | Danh sách chọn: Năm 1…Năm 5, Sau đại học, Khác | Tùy chọn |
| Trợ cấp cơ sở | Số thập phân ≥ 0, tối đa 12 chữ số | Dùng làm ngưỡng tham chiếu cho tips và phát hiện bất thường |
| Mục tiêu tiết kiệm | Số thập phân ≥ 0 | Hiển thị tiến độ trên dashboard |
| Tiền tệ | ISO 4217 (USD, VND…) | Định dạng số theo chuẩn en-US (vd. $1,234.50); đổi tiền tệ không quy đổi dữ liệu cũ |
| Đồng ý AI | Boolean, mặc định false | Khi false: chỉ dùng tầng luật/từ khóa và template, không gửi dữ liệu ra LLM |

Ngoài ra người dùng có thể: đổi mật khẩu (yêu cầu mật khẩu hiện tại), **tải xuống toàn bộ dữ liệu cá nhân** (JSON/CSV) và **yêu cầu xóa tài khoản** (thời gian ân hạn 30 ngày trước khi xóa vĩnh viễn) – xem mục 9.14.

## 5.3 Quản lý danh mục

Danh mục gồm hai loại: **danh mục mặc định** do admin quản lý (áp dụng cho mọi người dùng) và **danh mục cá nhân** do sinh viên tạo trong mục "Manage Own Categories". Mỗi danh mục thuộc loại income hoặc expense.

***Bảng 16: Danh mục mặc định theo SRS***

| **Loại** | **Danh mục mặc định (seed)** |
| --- | --- |
| Thu nhập (income) | Allowance · Part-time Job · Scholarship · Gift · Other Income |
| Chi tiêu (expense) | Food · Transport · Hostel/Rent · Academics (books, tuition, stationery) · Subscriptions (streaming, apps) · Entertainment (movies, outings) · Miscellaneous |

***Bảng 17: Quy tắc nghiệp vụ – Danh mục***

| **Mã** | **Quy tắc nghiệp vụ** |
| --- | --- |
| BR-CA-01 | Tên danh mục 1–50 ký tự, duy nhất trong phạm vi (người dùng, loại) và không trùng tên danh mục mặc định cùng loại. |
| BR-CA-02 | Sinh viên chỉ thêm/sửa/xóa danh mục cá nhân của mình; danh mục mặc định chỉ đọc (có thể ẩn khỏi danh sách chọn). |
| BR-CA-03 | Xóa danh mục đang có giao dịch: bắt buộc chọn danh mục thay thế để chuyển giao dịch sang (thực hiện trong một DB transaction), hoặc lưu trữ (archive – is_active = false). |
| BR-CA-04 | Mỗi người dùng tối đa 50 danh mục cá nhân (chống lạm dụng). |
| BR-CA-05 | Admin vô hiệu hóa danh mục mặc định không làm mất giao dịch cũ; danh mục chỉ bị ẩn khỏi lựa chọn mới. |

## 5.4 Ghi nhận thu nhập và chi tiêu

### 5.4.1 Thêm nhanh giao dịch

Nút "+ Quick add" luôn hiện trên dashboard, thanh điều hướng và nút nổi (FAB) trên mobile. Form gồm: loại (Income/Expense – mặc định Expense), số tiền, ngày (mặc định hôm nay), mô tả, danh mục (AI gợi ý) và tùy chọn "Repeat". Phím tắt: N mở form, Enter lưu, Esc đóng.

***Hình 12: Lưu đồ – Thêm giao dịch với gợi ý danh mục AI*** — mã nguồn Mermaid: [diagrams/v1_0_Hinh_12.mmd](diagrams/v1_0_Hinh_12.mmd); ảnh: [images/hinh-12.png](images/hinh-12.png)

***Bảng 18: Quy tắc nghiệp vụ – Giao dịch***

| **Mã** | **Quy tắc nghiệp vụ** |
| --- | --- |
| BR-TX-01 | Số tiền > 0 và ≤ 999.999.999.999,99; tối đa 2 chữ số thập phân (VND: 0 chữ số). Loại giao dịch quyết định dấu khi tính toán, không lưu số âm. |
| BR-TX-02 | Ngày giao dịch không vượt quá hôm nay + 1 ngày (cho phép lệch múi giờ) và không trước 01/01/2000. |
| BR-TX-03 | Danh mục phải cùng loại với giao dịch và thuộc về người dùng hoặc là danh mục mặc định đang hoạt động (kiểm tra ở server – chống gán danh mục của người khác). |
| BR-TX-04 | Mô tả tối đa 255 ký tự, được lưu dạng văn bản thuần; khi hiển thị luôn được escape (chống XSS). |
| BR-TX-05 | Sửa giao dịch dùng khóa lạc quan: client gửi version, server từ chối (409 Conflict) nếu phiên bản đã thay đổi. |
| BR-TX-06 | Sửa và xóa **giữ lại toàn bộ lịch sử** (SRS): mỗi thay đổi ghi một bản ghi transaction_history (append-only) chứa snapshot trước/sau. |
| BR-TX-07 | Xóa là xóa mềm; người dùng khôi phục được trong 30 ngày tại "Trash"; sau 30 ngày job dọn dẹp xóa vĩnh viễn dữ liệu giao dịch (lịch sử được ẩn danh hóa). |
| BR-TX-08 | Danh sách giao dịch phân trang (mặc định 20, tối đa 100), lọc theo khoảng ngày, loại, danh mục, khoảng số tiền, từ khóa mô tả; sắp xếp theo ngày/số tiền. |

### 5.4.2 Giao dịch định kỳ

Người dùng có thể đánh dấu một giao dịch là định kỳ (ví dụ: trợ cấp hằng tháng, phí Netflix). Hệ thống lưu một **quy tắc định kỳ** (recurring_rules) và job hằng ngày sẽ sinh giao dịch thực tế khi tới hạn. Tần suất hỗ trợ: hằng tuần, hằng tháng (chọn ngày trong tháng), hằng năm, với hệ số lặp (mỗi N kỳ).

***Hình 13: Lưu đồ – Sinh giao dịch định kỳ*** — ảnh: [images/hinh-13.png](images/hinh-13.png)

- Ngày 29–31 ở tháng không có ngày đó sẽ lấy ngày cuối tháng.

- Ràng buộc duy nhất (recurring_rule_id, recurring_period) bảo đảm không bao giờ sinh trùng kể cả khi job chạy lại.

- Người dùng có thể tạm dừng, sửa (áp dụng cho các kỳ tương lai) hoặc xóa quy tắc; giao dịch đã sinh không bị ảnh hưởng.

- Nếu hệ thống ngừng vài ngày, job bù (catch-up) sinh đủ các kỳ bị lỡ, tối đa 12 kỳ mỗi quy tắc.

### 5.4.3 Vòng đời giao dịch

***Hình 14: Sơ đồ trạng thái – Vòng đời giao dịch*** — ảnh: [images/hinh-14.png](images/hinh-14.png)

## 5.5 Nhập giao dịch từ file CSV

SRS yêu cầu nhập hàng loạt giao dịch lịch sử từ CSV kèm gợi ý phân loại hàng loạt. Quy trình gồm ba bước: **Tải lên → Xem trước & chỉnh sửa → Xác nhận**. Không có dữ liệu nào được ghi vào bảng giao dịch trước khi người dùng xác nhận.

***Bảng 19: Định dạng file CSV nhập***

| **Cột CSV** | **Bắt buộc** | **Định dạng chấp nhận** | **Ví dụ** |
| --- | --- | --- | --- |
| date | Có | YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY (người dùng chọn khi xem trước) | 2026-09-15 |
| amount | Có | Số dương, dấu thập phân "." hoặc ","; bỏ ký hiệu tiền tệ | 4.50 |
| type | Không | income / expense (mặc định expense); hoặc suy ra từ dấu âm | expense |
| description | Có | Văn bản ≤ 255 ký tự | Campus Cafe latte |
| category | Không | Tên danh mục; để trống thì AI gợi ý | Food |

- Giới hạn: file ≤ 2 MB, ≤ 5.000 dòng, mã hóa UTF-8 (tự nhận diện và loại BOM), phân tách bằng dấu phẩy hoặc chấm phẩy.

- Hệ thống cung cấp file mẫu tải về và giao diện ánh xạ cột nếu tên cột khác chuẩn.

- Phát hiện dòng trùng với giao dịch đã có (cùng ngày, số tiền, mô tả) và mặc định bỏ chọn các dòng đó.

- Bản xem trước lưu tạm 24 giờ; kết quả nhập gồm số dòng thành công, số dòng lỗi và file báo cáo lỗi có thể tải về.

- Chi tiết kiểm soát an toàn file xem mục 9.10.

***Hình 15: Sơ đồ tuần tự – Nhập CSV với phân loại hàng loạt*** — ảnh: [images/hinh-15.png](images/hinh-15.png) — mã nguồn sơ đồ: [diagrams/v1_0_Hinh_15.mmd](diagrams/v1_0_Hinh_15.mmd)

## 5.6 Trợ lý phân loại chi tiêu bằng AI

Khi người dùng gõ mô tả (ví dụ "Campus Cafe"), hệ thống gợi ý danh mục (Food). Bộ phân loại hoạt động theo **ba tầng**, dừng ở tầng đầu tiên cho kết quả đủ tin cậy:

***Bảng 20: Ba tầng phân loại***

| **Tầng** | **Cơ chế** | **Độ tin cậy** | **Độ trễ** |
| --- | --- | --- | --- |
| 1 – Luật cá nhân | Tra ai_category_rules theo (user_id, merchant_key); luật được tạo/củng cố mỗi khi người dùng chọn hoặc sửa danh mục | 0,95 (≥ 2 lần xác nhận) / 0,8 (1 lần) | < 10 ms |
| 2 – Từ khóa toàn cục | Từ điển ~300 từ khóa tiếng Anh (cafe, coffee, canteen, grab, bus, metro, rent, dorm, netflix, spotify, textbook, tuition…) ánh xạ tới danh mục mặc định | 0,75 | < 5 ms |
| 3 – LLM | Prompt có ranh giới rõ ràng, chỉ gửi mô tả đã làm sạch + danh sách tên danh mục; yêu cầu đầu ra JSON {category, confidence}; kết quả không thuộc danh sách bị loại | Do mô hình trả về, giới hạn ≤ 0,9 | 300–1.500 ms, timeout 3 s |

- **Chuẩn hóa merchant key:** chữ thường, bỏ dấu (kể cả dấu tiếng Việt nếu người dùng gõ), bỏ số/ký tự đặc biệt, bỏ từ dừng ("at", "the", "from"), cắt 100 ký tự. Ví dụ "Campus Café #12" → "campus cafe".

- **Học từ sửa đổi:** khi người dùng đổi danh mục so với gợi ý (ai_overridden) hoặc chọn thủ công, hệ thống upsert luật (merchant_key → category) và tăng hit_count; luật mới thay thế luật cũ nếu bị sửa 2 lần liên tiếp.

- **Ghi đè thủ công:** gợi ý chỉ là giá trị mặc định có nhãn "AI suggestion"; người dùng luôn chọn lại được. Hệ thống lưu ai_suggested_category_id và ai_confidence để đo độ chính xác (tỷ lệ chấp nhận).

- **Phía client:** debounce 400 ms, hủy request cũ khi người dùng gõ tiếp; lỗi AI không bao giờ chặn việc lưu giao dịch.

- **Chi phí:** cache kết quả LLM theo hash(merchant_key + danh sách danh mục) 7 ngày; giới hạn 200 lời gọi LLM/người dùng/ngày.

***Hình 16: Sơ đồ tuần tự – Phân loại danh mục ba tầng*** — ảnh: [images/hinh-16.png](images/hinh-16.png) — mã nguồn sơ đồ: [diagrams/v1_0_Hinh_16.mmd](diagrams/v1_0_Hinh_16.mmd)

## 5.7 Dashboard cá nhân hóa

Dashboard là trang đích sau khi đăng nhập, gồm các widget sau (dữ liệu lấy từ một endpoint tổng hợp /dashboard/summary được cache 60 giây và tự làm mới khi có giao dịch mới):

***Bảng 21: Các widget trên Dashboard***

| **Widget** | **Nội dung** | **Nguồn dữ liệu / Công thức** |
| --- | --- | --- |
| Lời chào | "Good morning, An!" theo giờ địa phương + thông báo hệ thống đang hiệu lực | Hồ sơ người dùng, announcements |
| Số dư tháng này | Tổng thu, tổng chi, chênh lệch; so sánh với tháng trước (%) | SUM theo type trong tháng hiện tại |
| Nút thêm nhanh | Thêm Thu / Thêm Chi / Nhập CSV | – |
| Top danh mục tháng này | Danh mục chi nhiều nhất và tỷ trọng | GROUP BY category ORDER BY SUM DESC LIMIT 1 |
| Ngân sách vs Thực tế | Thanh tiến độ cho từng danh mục có ngân sách; xanh < 80%, vàng 80–99%, đỏ ≥ 100% | budgets JOIN tổng chi theo danh mục |
| Cơ cấu chi tiêu | Biểu đồ doughnut theo danh mục | Tổng chi theo danh mục |
| Xu hướng 6 tháng | Biểu đồ cột thu vs chi | Tổng theo tháng, 6 tháng gần nhất |
| Mẹo tiết kiệm | Top 3 tip theo điểm tác động, nút Pin / Ẩn / Lưu | Tips engine (mục 5.10) |
| Mục tiêu tiết kiệm | Tiến độ: (thu − chi) / mục tiêu | Hồ sơ + tổng tháng |
| Nhận định mới nhất | Tóm tắt nhận định tháng trước + link xem chi tiết | Bảng insights |
| Gần đây | Giao dịch vừa xem/sửa gần nhất | recent_activity (mục 5.14) |

## 5.8 Báo cáo hằng tháng và xuất file

***Bảng 22: Các loại báo cáo***

| **Báo cáo** | **Mô tả** | **Biểu đồ** |
| --- | --- | --- |
| Theo danh mục | Tổng chi/thu theo danh mục trong khoảng thời gian, tỷ trọng %, số giao dịch, so sánh với kỳ trước | Doughnut + bảng |
| Thu vs Chi 6 tháng | Tổng thu, tổng chi, tiết kiệm ròng từng tháng trong 6 tháng gần nhất | Cột nhóm + đường tiết kiệm |
| Ngày / Tuần tháng hiện tại | Chi tiêu theo từng ngày và từng tuần (ISO week) của tháng hiện tại, đường trung bình | Cột theo ngày, cột theo tuần |
| Dự báo tháng tới | Dự báo thu/chi theo danh mục (mục 5.14) | Đường + vùng sai số |

- **Bộ lọc chung:** khoảng ngày (preset: tháng này, tháng trước, 3/6 tháng, tùy chọn), danh mục (nhiều lựa chọn), nguồn thu nhập. Bộ lọc được phản ánh lên URL query để chia sẻ/bookmark trạng thái.

- **Xuất PDF** (server-side, pdfmake, font Roboto; nội dung tiếng Anh, hiển thị đúng dữ liệu có dấu tiếng Việt do người dùng nhập): trang bìa tháng, bảng tổng hợp, biểu đồ, top giao dịch, nhận định tháng (nếu có), ghi chú miễn trừ "Not financial advice".

- **Xuất ảnh PNG** (client-side): chụp vùng báo cáo đang hiển thị.

- **Chia sẻ qua email:** gửi PDF đính kèm tới email do người dùng nhập; giới hạn 5 email/ngày; không đính kèm liên kết công khai tới dữ liệu.

- Hiệu năng: truy vấn tổng hợp dùng chỉ mục (user_id, txn_date) và (user_id, category_id, txn_date); các tháng đã kết thúc được cache lâu hơn (1 giờ).

***Hình 17: Sơ đồ tuần tự – Xuất và chia sẻ báo cáo*** — ảnh: [images/hinh-17.png](images/hinh-17.png) — mã nguồn sơ đồ: [diagrams/v1_0_Hinh_17.mmd](diagrams/v1_0_Hinh_17.mmd)

## 5.9 Nhận định chi tiêu hằng tháng bằng AI

Vào 00:30 ngày 1 hằng tháng (và khi người dùng nhấn "Regenerate", tối đa 3 lần/tháng), hệ thống sinh nhận định cho tháng trước với người dùng có ≥ 5 giao dịch. Nguyên tắc cốt lõi: **backend tính toàn bộ số liệu, LLM chỉ diễn đạt**.

### 5.9.1 Thuật toán phát hiện mẫu chi tiêu

- Với mỗi danh mục chi c: tính cur(c) = tổng chi tháng M; avg3(c) = trung bình 3 tháng trước đó (bỏ qua tháng không có dữ liệu, cần ≥ 2 tháng).

- Tăng trưởng g(c) = (cur − avg3) / avg3. Đánh dấu (flag) nếu g ≥ 25% **và** chênh lệch tuyệt đối ≥ max(5 đơn vị tiền, 5% trợ cấp cơ sở).

- Bổ sung cờ: vượt ngân sách, tỷ lệ tiết kiệm tháng (thu − chi)/thu, danh mục mới xuất hiện, giao dịch bất thường lớn nhất.

- Chọn tối đa 3 mẫu có chênh lệch tuyệt đối lớn nhất để đưa vào nhận định.

- Sinh lời khuyên hành động cụ thể: hạn mức tuần đề xuất = avg3 / 4,33 (làm tròn); hoặc gợi ý thay thế chi phí thấp theo danh mục (nấu ăn tại KTX, vé tháng xe buýt, gói sinh viên…).

### 5.9.2 Thiết kế prompt và kiểm soát đầu ra

- **Đầu vào LLM** chỉ là JSON tổng hợp: tháng, đơn vị tiền, tổng thu/chi, danh sách mẫu đã flag (tên danh mục, cur, avg3, g), tỷ lệ tiết kiệm. **Không** gửi họ tên, email, mô tả giao dịch thô.

- **Ràng buộc prompt:** vai trò "friendly financial assistant for students"; luôn viết bằng tiếng Anh; ≤ 120 từ; chỉ dùng số có trong dữ liệu; không khuyên đầu tư/vay nợ; giọng tích cực; đầu ra JSON {summary_text, tip_text}; temperature 0,3.

- **Kiểm tra đầu ra:** parse JSON theo schema; độ dài hợp lệ; mọi con số xuất hiện trong văn bản phải khớp (sai số làm tròn) với số liệu đầu vào; lọc nội dung không phù hợp. Không đạt → dùng template.

- Lưu stats_snapshot, model, prompt_version để truy vết và tái lập kết quả; hiển thị nhãn "AI-generated insight – for reference only".

- Lịch sử nhận định được lưu theo tháng, người dùng xem lại và bookmark được.

***Hình 18: Sơ đồ tuần tự – Sinh nhận định hằng tháng*** — mã nguồn Mermaid: [diagrams/v1_0_Hinh_18.mmd](diagrams/v1_0_Hinh_18.mmd); ảnh: [images/hinh-18.png](images/hinh-18.png)

***Hình 19: Sơ đồ trạng thái – Job sinh nhận định*** — mã nguồn Mermaid: [diagrams/v1_0_Hinh_19.mmd](diagrams/v1_0_Hinh_19.mmd); ảnh: [images/hinh-19.png](images/hinh-19.png)

## 5.10 Engine mẹo tiết kiệm cá nhân hóa

Engine mẹo **không phụ thuộc AI**: sinh tip từ dữ liệu trong CSDL bằng cách so sánh chi tiêu hiện tại với trung bình lịch sử và ngân sách/mục tiêu (đúng yêu cầu SRS). Mỗi tip được xếp hạng theo **tác động tiết kiệm tiềm năng**.

***Bảng 23: Bộ quy tắc sinh mẹo***

| **Quy tắc** | **Điều kiện kích hoạt** | **Tác động (impact) ước tính** | **Ví dụ nội dung** |
| --- | --- | --- | --- |
| R1 Nguy cơ vượt ngân sách | projected(c) > limit(c) | projected − limit | "At this pace, Food will go 12 USD over budget. Try a 20 USD weekly cap." |
| R2 Tăng so với trung bình | projected(c) > 1,2 × avg3(c) | projected − avg3 | "Entertainment spending is up 35% from your usual." |
| R3 Khoản nhỏ lặp lại | ≥ 8 giao dịch < 5% trợ cấp trong 7 ngày cùng danh mục | 50% tổng các khoản nhỏ | "11 drink purchases this week = 27 USD. Brewing coffee in your room could save ~13 USD." |
| R4 Nhiều dịch vụ đăng ký | ≥ 3 giao dịch định kỳ thuộc Subscriptions | Khoản đăng ký nhỏ nhất | "You are paying for 4 subscriptions. Review the one you use least?" |
| R5 Chưa đạt mục tiêu tiết kiệm | thu − projected_chi < mục tiêu | Khoảng thiếu hụt | "You are 15 USD short of this month's savings goal." |
| R6 Chi cuối tuần tăng vọt | Chi T7–CN > 1,5 × trung bình ngày thường × 2 | Phần vượt | "Weekends made up 45% of this week's spending." |
| R0 Mẫu chung (admin) | Luôn khả dụng, điểm thấp | Cố định nhỏ | Mẹo chung do admin soạn trong Tip Templates |

- projected(c) = spent_to_date(c) / số_ngày_đã_qua × số_ngày_trong_tháng (chỉ áp dụng từ ngày thứ 5 của tháng để tránh nhiễu).

- score = impact × confidence × recency; confidence phụ thuộc số tháng lịch sử (1 tháng: 0,5; 2: 0,75; ≥3: 1,0); recency giảm dần nếu tip đã hiển thị nhiều ngày không tương tác.

- Tip đã **pin** luôn hiển thị đầu; tip **dismiss** không xuất hiện lại trong 30 ngày (cùng quy tắc + danh mục). Hiển thị Top 3 trên dashboard, xem tất cả ở trang Mẹo.

- Nội dung tip được render từ tip_templates (admin quản lý) với biến {category}, {amount}, {percent}; mọi biến được escape.

***Hình 20: Lưu đồ – Engine sinh và xếp hạng mẹo tiết kiệm*** — ảnh: [images/hinh-20.png](images/hinh-20.png)

## 5.11 Ngân sách và cảnh báo

Sinh viên đặt hạn mức theo danh mục chi cho từng tháng (ví dụ Food: 30 USD). Có chức năng "Copy last month's budget". Mức tiêu thụ hiển thị theo thời gian thực bằng progress bar; khi giao dịch mới làm tiêu thụ chạm ngưỡng cảnh báo (mặc định 80%, tùy chỉnh 50–100%) hoặc vượt 100%, hệ thống gửi thông báo trong ứng dụng.

***Hình 21: Lưu đồ – Kiểm tra ngân sách và gửi cảnh báo*** — ảnh: [images/hinh-21.png](images/hinh-21.png) — mã nguồn sơ đồ: [diagrams/v1_0_Hinh_21.mmd](diagrams/v1_0_Hinh_21.mmd)

- Mỗi mức cảnh báo (NEAR_LIMIT, EXCEEDED) chỉ gửi **một lần** cho mỗi ngân sách mỗi tháng nhờ khóa dedupe_key duy nhất; nếu người dùng xóa giao dịch khiến mức tiêu thụ giảm xuống dưới ngưỡng rồi lại vượt, cảnh báo được phép gửi lại.

- Thông báo được lưu trong bảng notifications và hiển thị ở chuông thông báo + toast; frontend tải lại danh sách ngay sau khi người dùng lưu giao dịch và polling 60 giây khi đang mở ứng dụng.

## 5.12 Bookmark, ghi chú và chia sẻ

- Người dùng bookmark một mẹo, một nhận định tháng hoặc một báo cáo (lưu bộ lọc) để xem lại; mỗi bookmark có ghi chú cá nhân ≤ 500 ký tự.

- Trang "Saved" liệt kê theo loại, tìm kiếm theo ghi chú; xóa bookmark không ảnh hưởng đối tượng gốc.

- Xuất báo cáo tháng hoặc bản tóm tắt tiết kiệm dạng PDF và chia sẻ qua email (mục 5.8).

## 5.13 Bảng điều khiển quản trị

***Hình 22: Lưu đồ – Đăng nhập quản trị và quản lý người dùng*** — mã nguồn Mermaid: [diagrams/v1_0_Hinh_22.mmd](diagrams/v1_0_Hinh_22.mmd); ảnh: [images/hinh-22.png](images/hinh-22.png)

***Bảng 24: Chức năng quản trị***

| **Chức năng** | **Chi tiết** | **Ràng buộc bảo mật** |
| --- | --- | --- |
| Danh mục mặc định | Thêm/sửa/ẩn danh mục income/expense áp dụng cho mọi sinh viên; sắp xếp thứ tự, biểu tượng, màu | Không xóa cứng danh mục đã có giao dịch |
| Mẫu mẹo & thông báo | CRUD tip templates (quy tắc, tiêu đề, nội dung có biến); CRUD thông báo hệ thống có thời gian hiệu lực | Nội dung được lọc HTML, xem trước trước khi xuất bản |
| Tài khoản người dùng | Tìm kiếm, xem thông tin tài khoản (tên, email, trạng thái, ngày tạo, lần đăng nhập cuối, số giao dịch), vô hiệu hóa/kích hoạt, gửi link đặt lại mật khẩu | Admin không xem chi tiết giao dịch cá nhân; không tự đặt mật khẩu cho người dùng; email hiển thị dạng che một phần trong danh sách |
| Thống kê sử dụng | Người dùng hoạt động (DAU/MAU), tổng giao dịch, danh mục được dùng nhiều nhất, tỷ lệ chấp nhận gợi ý AI, số nhận định đã sinh | Chỉ số tổng hợp, ẩn nhóm < 5 người dùng (k-anonymity) |
| Nhật ký kiểm toán | Tra cứu audit log theo thời gian, hành động, người thực hiện | Chỉ đọc; không sửa/xóa được |

## 5.14 Trí tuệ hệ thống (Advanced UX)

***Bảng 25: Tính năng trí tuệ hệ thống***

| **Tính năng** | **Thiết kế** |
| --- | --- |
| Giao dịch xem/sửa gần đây | Ghi recent_activity khi mở chi tiết hoặc sửa giao dịch; giữ 20 bản ghi gần nhất mỗi người dùng; đồng bộ qua các phiên/thiết bị vì lưu phía server |
| Dự báo tháng tới | Cho mỗi danh mục: trung bình trượt có trọng số 3 tháng (0,5 · M−1 + 0,3 · M−2 + 0,2 · M−3), cộng các khoản định kỳ đã biết; khoảng tin cậy ±1 độ lệch chuẩn; cần ≥ 2 tháng dữ liệu, nếu không hiển thị "Not enough data yet" |
| Phát hiện giao dịch bất thường | Với danh mục có ≥ 5 giao dịch trong 90 ngày: bất thường nếu số tiền > trung bình + 3σ hoặc > 3 × trung vị, **và** > 20% trợ cấp cơ sở. Đánh dấu is_anomaly, thông báo "Unusually large expense – is this correct?" |
| Phát hiện trùng lặp | Cùng người dùng, cùng số tiền và loại, cùng danh mục hoặc merchant_key giống nhau (khoảng cách Levenshtein ≤ 2), ngày chênh ≤ 1, tạo cách nhau ≤ 10 phút, không phải giao dịch định kỳ → is_possible_duplicate; người dùng chọn "Keep" hoặc "Delete duplicate" |

## 5.15 Khả năng tiếp cận và nâng cao giao diện

- **Dark mode:** công tắc trên thanh điều hướng, dùng color mode của Bootstrap 5.3 (data-bs-theme), mặc định theo hệ điều hành (prefers-color-scheme), lưu lựa chọn; bảng màu biểu đồ có biến thể tối bảo đảm độ tương phản.

- **Điều chỉnh cỡ chữ:** 4 mức (90%, 100%, 115%, 130%) thay đổi font-size gốc; toàn bộ kích thước dùng rem nên co giãn đồng bộ.

- **Breadcrumbs:** hiển thị ở mọi trang con (ví dụ Trang chủ › Báo cáo › Theo danh mục), sinh tự động từ cấu hình route.

- **Chuyển cảnh và chỉ báo tải:** skeleton cho thẻ/biểu đồ, spinner cho nút đang xử lý, hiệu ứng chuyển trang 150–200 ms; tôn trọng prefers-reduced-motion.

- Chi tiết tiêu chí WCAG xem mục 8.5.

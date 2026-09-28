# Kịch bản kiểm thử luồng thủ công

## Quy ước chạy kiểm thử

- Áp dụng cho bản demo/local đã chạy seed và có dữ liệu mẫu. Thực hiện **từng kịch bản** trên Chrome, Firefox và Edge (hai phiên bản mới nhất) trên máy tính, đồng thời kiểm tra trên điện thoại (Android Chrome và/hoặc iPhone Safari). Nếu chỉ có mô phỏng thiết bị, ghi rõ kích thước viewport và trình duyệt đã dùng.
- Với mỗi môi trường, đánh dấu kết quả trong bản ghi của kịch bản; chỉ kết luận **Đạt** khi mọi môi trường bắt buộc đều đạt. Ghi phiên bản trình duyệt/thiết bị trong ghi chú của người kiểm.
- URL local theo mục 11.4: ứng dụng `http://localhost:8080`, cổng admin `http://localhost:8080/admin/login`, Mailpit `http://localhost:8025`. Dùng hộp thư Mailpit để mở liên kết xác minh/đặt lại mật khẩu và nhận email chia sẻ.
- Dữ liệu seed demo chỉ dùng cho kiểm thử. Dùng dữ liệu riêng biệt hoặc khôi phục fixture giữa các lần chạy khi thao tác làm thay đổi dữ liệu.

| Vai trò                                                  | Email                       | Mật khẩu              | Dùng trong                              |
| -------------------------------------------------------- | --------------------------- | --------------------- | --------------------------------------- |
| Quản trị viên                                            | `admin@campuscoin.demo`     | `Admin@Campus2026!`   | MT-02                                   |
| Sinh viên 1 (AI bật, có ngân sách/nhận định)             | `an.nguyen@campuscoin.demo` | `Student@Campus2026!` | MT-03–06, MT-08–14                      |
| Sinh viên 2 (AI tắt, có giao dịch định kỳ)               | `binh.tran@campuscoin.demo` | `Student@Campus2026!` | MT-05, MT-14; đối chứng chế độ không AI |
| Sinh viên 3 (tài khoản demo mới, dùng onboarding/import) | `chi.le@campuscoin.demo`    | `Student@Campus2026!` | MT-07                                   |
| Sinh viên bị khóa                                        | `disabled@campuscoin.demo`  | `Student@Campus2026!` | MT-02                                   |

## MT-01 – Đăng ký, xác minh, đăng nhập và khôi phục mật khẩu

**Mục tiêu:** Kiểm tra vòng đời xác thực sinh viên, xác minh email, đặt lại mật khẩu và phiên đăng nhập.

**Tài khoản dùng:** Email mới chưa đăng ký; hộp thư kiểm thử Mailpit.

**Các bước:**

1. Mở trang đăng ký sinh viên, nhập thông tin hợp lệ và email mới; gửi đăng ký.
2. Thử đăng nhập trước khi xác minh email; sau đó mở thư trong Mailpit và xác minh bằng liên kết.
3. Đăng nhập bằng mật khẩu vừa đăng ký; làm mới trang để xác nhận phiên còn hợp lệ, rồi đăng xuất.
4. Chọn quên mật khẩu, yêu cầu thư đặt lại; mở liên kết/token trong Mailpit và đặt mật khẩu mới.
5. Đăng nhập bằng mật khẩu mới; thử lại mật khẩu cũ và thử dùng lại liên kết/token đã dùng.

**Kết quả mong đợi:** Tài khoản được tạo; tài khoản chưa xác minh không đăng nhập được; xác minh thành công cho phép đăng nhập; phiên được duy trì an toàn trong thời hạn; mật khẩu mới dùng được, mật khẩu cũ và token đã dùng không còn hiệu lực. Thông báo không làm lộ việc một email bất kỳ có tài khoản hay không.

| Đạt | Không đạt | Người kiểm | Ngày |
| --- | --------- | ---------- | ---- |
| ☐   | ☐         | -          | -    |

## MT-02 – Đăng nhập và quản trị bằng cổng riêng

**Mục tiêu:** Kiểm tra đăng nhập admin riêng và các thao tác quản trị chính.

**Tài khoản dùng:** Admin, sinh viên bị khóa; một tài khoản sinh viên hoạt động để thử truy cập chéo.

**Các bước:**

1. Mở `/admin/login`, đăng nhập bằng tài khoản admin; thử mở cổng admin bằng phiên sinh viên và thử đăng nhập admin từ trang sinh viên.
2. Trong admin, tạo/sửa/xóa một danh mục mặc định và một mẫu tip hoặc thông báo; kiểm tra dữ liệu lưu lại.
3. Tìm tài khoản sinh viên, xem thông tin, vô hiệu hóa rồi thử đăng nhập tài khoản đó; thực hiện quy trình reset/mở lại theo quyền được cung cấp.
4. Mở thống kê admin và kiểm tra số người dùng hoạt động, tổng giao dịch, danh mục được dùng nhiều.
5. Thử đăng nhập tài khoản `disabled@campuscoin.demo`.

**Kết quả mong đợi:** Admin chỉ vào được qua cổng riêng và đúng quyền; phiên sinh viên không truy cập được chức năng admin. Thay đổi danh mục/mẫu được lưu; thao tác tài khoản và thống kê phản ánh dữ liệu; tài khoản bị vô hiệu hóa không đăng nhập được.

| Đạt | Không đạt | Người kiểm | Ngày |
| --- | --------- | ---------- | ---- |
| ☐   | ☐         | -          | -    |

## MT-03 – Cập nhật hồ sơ và danh mục cá nhân

**Mục tiêu:** Kiểm tra thông tin hồ sơ và vòng đời danh mục thu/chi cá nhân.

**Tài khoản dùng:** Sinh viên 1.

**Các bước:**

1. Mở hồ sơ, cập nhật tên, năm học, mức trợ cấp tháng và mục tiêu tiết kiệm; lưu rồi tải lại trang.
2. Tạo danh mục cá nhân loại thu và loại chi; thử sửa tên và xóa danh mục chưa được giao dịch sử dụng.
3. Kiểm tra danh mục mặc định vẫn có sẵn và danh mục cá nhân được phân biệt đúng loại thu/chi.
4. Thử gửi dữ liệu thiếu/sai định dạng hoặc dùng tên danh mục trùng nếu giao diện cho phép nhập.

**Kết quả mong đợi:** Hồ sơ và danh mục hợp lệ được lưu, hiển thị sau khi tải lại; danh mục thu/chi không lẫn loại. Dữ liệu sai bị từ chối với thông báo rõ ràng; không mất các danh mục mặc định.

| Đạt | Không đạt | Người kiểm | Ngày |
| --- | --------- | ---------- | ---- |
| ☐   | ☐         | -          | -    |

## MT-04 – Thêm nhanh giao dịch và gợi ý AI

**Mục tiêu:** Kiểm tra thêm nhanh thu/chi, gợi ý danh mục, ghi đè thủ công và học từ chỉnh sửa.

**Tài khoản dùng:** Sinh viên 1 (AI bật).

**Các bước:**

1. Từ dashboard, dùng thêm nhanh để tạo một khoản thu và một khoản chi hợp lệ, gồm số tiền, ngày, mô tả và danh mục.
2. Nhập mô tả chi tiêu có ngữ cảnh rõ (ví dụ “Campus Cafe”) và quan sát danh mục AI đề xuất.
3. Chọn danh mục khác để ghi đè, lưu giao dịch; tạo giao dịch tương tự lần nữa để quan sát gợi ý sau chỉnh sửa.
4. Đăng nhập Sinh viên 2 (AI tắt) và thử thêm giao dịch, xác nhận luồng cơ bản vẫn dùng được.

**Kết quả mong đợi:** Thu/chi được lưu đúng số tiền, ngày và danh mục; gợi ý AI xuất hiện khi khả dụng và không ngăn người dùng chọn danh mục khác. Hệ thống ghi nhận điều chỉnh để cải thiện gợi ý tương lai; khi AI tắt, thêm giao dịch vẫn hoạt động và không hiển thị gợi ý giả.

| Đạt | Không đạt | Người kiểm | Ngày |
| --- | --------- | ---------- | ---- |
| ☐   | ☐         | -          | -    |

## MT-05 – Tạo và xử lý giao dịch định kỳ

**Mục tiêu:** Kiểm tra cấu hình quy tắc định kỳ và việc tạo giao dịch theo lịch.

**Tài khoản dùng:** Sinh viên 1 hoặc Sinh viên 2.

**Các bước:**

1. Tạo quy tắc định kỳ cho khoản thu hoặc chi với chu kỳ tháng, ngày bắt đầu, danh mục và số tiền.
2. Lưu, mở lại quy tắc để xác nhận cấu hình; sửa một trường rồi lưu.
3. Qua thời điểm chạy của lịch trong môi trường kiểm thử hoặc dùng chức năng chạy thử sẵn có; kiểm tra giao dịch được tạo.
4. Tắt/xóa quy tắc và kiểm tra các giao dịch đã tạo trước đó.

**Kết quả mong đợi:** Quy tắc được lưu/sửa đúng; mỗi kỳ chỉ phát sinh giao dịch tương ứng, không tạo bản ghi trùng; dừng quy tắc ngăn các kỳ tương lai nhưng không làm mất lịch sử đã phát sinh.

| Đạt | Không đạt | Người kiểm | Ngày |
| --- | --------- | ---------- | ---- |
| ☐   | ☐         | -          | -    |

## MT-06 – Sửa, xóa, khôi phục và xem lịch sử giao dịch

**Mục tiêu:** Xác nhận giao dịch giữ lịch sử đầy đủ khi sửa/xóa và có thể khôi phục theo luồng sản phẩm.

**Tài khoản dùng:** Sinh viên 1.

**Các bước:**

1. Mở một giao dịch gần đây, sửa mô tả, số tiền hoặc danh mục; lưu.
2. Mở lịch sử giao dịch và đối chiếu giá trị trước/sau chỉnh sửa.
3. Xóa giao dịch; xác nhận nó không còn được tính vào tổng hiện tại và kiểm tra bản ghi lịch sử.
4. Dùng thao tác khôi phục nếu được cung cấp; kiểm tra giao dịch xuất hiện lại và lịch sử vẫn ghi nhận xóa/khôi phục.
5. Mở hoạt động gần đây và xem giao dịch vừa xem/sửa.

**Kết quả mong đợi:** Sửa/xóa/khôi phục phản ánh chính xác trong danh sách và số liệu; lịch sử lưu các thay đổi, không bị ghi đè/mất; hoạt động gần đây cập nhật đúng. Tài khoản khác không thể xem hoặc thay đổi giao dịch này.

| Đạt | Không đạt | Người kiểm | Ngày |
| --- | --------- | ---------- | ---- |
| ☐   | ☐         | -          | -    |

## MT-07 – Nhập CSV và phân loại hàng loạt

**Mục tiêu:** Kiểm tra nhập lịch sử giao dịch từ CSV, xem trước, gợi ý AI và xử lý dòng không hợp lệ.

**Tài khoản dùng:** Sinh viên 3; tệp CSV thử nghiệm có các dòng hợp lệ, dòng thiếu/sai dữ liệu và mô tả có thể gợi ý danh mục.

**Các bước:**

1. Mở nhập giao dịch và tải CSV thử nghiệm.
2. Kiểm tra màn hình xem trước: ánh xạ cột, ngày, số tiền, loại giao dịch và cảnh báo dòng lỗi.
3. Yêu cầu gợi ý phân loại hàng loạt; chấp nhận một số gợi ý, ghi đè ít nhất một danh mục.
4. Xác nhận nhập; mở danh sách giao dịch và kiểm tra kết quả. Thử nhập lại cùng tệp nếu hỗ trợ nhận diện trùng.

**Kết quả mong đợi:** Dòng hợp lệ được nhập đúng; gợi ý có thể chấp nhận hoặc ghi đè; dòng sai được báo rõ và không tạo giao dịch sai. Kết quả nhập có trạng thái/lịch sử batch; việc nhập lại không âm thầm nhân đôi giao dịch nếu chức năng chống trùng áp dụng.

| Đạt | Không đạt | Người kiểm | Ngày |
| --- | --------- | ---------- | ---- |
| ☐   | ☐         | -          | -    |

## MT-08 – Dashboard và các widget cá nhân hóa

**Mục tiêu:** Kiểm tra dashboard phản ánh dữ liệu giao dịch, mẹo và ngân sách của tài khoản.

**Tài khoản dùng:** Sinh viên 1 có dữ liệu 6 tháng, ngân sách và nhận định.

**Các bước:**

1. Đăng nhập và mở dashboard; xác nhận lời chào cá nhân hóa và số dư tháng hiện tại.
2. Đối chiếu tổng thu/chi với một số giao dịch trong tháng.
3. Kiểm tra nút thêm nhanh, mẹo tiết kiệm, danh mục chi tiêu hàng đầu và Budget vs. Actual.
4. Thêm một giao dịch thử, tải lại dashboard và đối chiếu widget bị ảnh hưởng.

**Kết quả mong đợi:** Các số liệu và widget khớp dữ liệu của đúng người dùng/tháng; lời chào, mẹo, Top Category và Budget vs. Actual hiển thị khi có dữ liệu; dashboard cập nhật sau thay đổi và có trạng thái tải phù hợp.

| Đạt | Không đạt | Người kiểm | Ngày |
| --- | --------- | ---------- | ---- |
| ☐   | ☐         | -          | -    |

## MT-09 – Báo cáo, lọc, xuất PDF/PNG và chia sẻ email

**Mục tiêu:** Kiểm tra ba dạng báo cáo, bộ lọc, xuất tệp và chia sẻ báo cáo qua email.

**Tài khoản dùng:** Sinh viên 1; hộp thư kiểm thử Mailpit.

**Các bước:**

1. Mở báo cáo chi tiêu theo danh mục của tháng và đối chiếu tổng với giao dịch.
2. Mở báo cáo thu so với chi sáu tháng; kiểm tra đủ các tháng và chuỗi số liệu.
3. Mở tổng hợp chi tiêu theo ngày/tuần trong tháng hiện tại.
4. Lọc theo khoảng ngày, danh mục và nguồn thu; thay đổi từng bộ lọc và xác nhận kết quả tương ứng.
5. Xuất báo cáo tháng thành PDF và ảnh PNG; mở tệp để xác nhận nội dung đọc được.
6. Chia sẻ báo cáo qua email tới hộp thư thử nghiệm; mở thư và kiểm tra nội dung/tệp đính kèm hoặc liên kết.

**Kết quả mong đợi:** Cả ba báo cáo và các bộ lọc phản ánh đúng phạm vi đã chọn; PDF/PNG được tạo, mở được và chứa dữ liệu tương ứng; email được gửi tới địa chỉ đã nhập mà không làm lộ dữ liệu người dùng khác.

| Đạt | Không đạt | Người kiểm | Ngày |
| --- | --------- | ---------- | ---- |
| ☐   | ☐         | -          | -    |

## MT-10 – Nhận định AI theo tháng và lịch sử

**Mục tiêu:** Kiểm tra nhận định AI, cảnh báo tăng trưởng, lời khuyên và lưu lịch sử theo tháng.

**Tài khoản dùng:** Sinh viên 1 (AI bật, có lịch sử giao dịch); Sinh viên 2 làm đối chứng (AI tắt).

**Các bước:**

1. Mở nhận định tháng của Sinh viên 1 và yêu cầu tạo/cập nhật nhận định nếu có thao tác.
2. Kiểm tra phần tóm tắt, danh mục tăng cao so với xu hướng cá nhân và lời khuyên hành động.
3. Mở nhận định của tháng trước trong lịch sử.
4. Mở cùng chức năng với Sinh viên 2 khi AI tắt.

**Kết quả mong đợi:** Nhận định ngắn, gắn với dữ liệu và xu hướng của đúng tài khoản; cờ tăng trưởng có cơ sở so sánh và lời khuyên liên quan; lịch sử tháng trước mở được. Khi AI không khả dụng, giao diện báo trạng thái phù hợp và các chức năng khác vẫn dùng được.

| Đạt | Không đạt | Người kiểm | Ngày |
| --- | --------- | ---------- | ---- |
| ☐   | ☐         | -          | -    |

## MT-11 – Mẹo tiết kiệm, xếp hạng, pin và dismiss

**Mục tiêu:** Kiểm tra mẹo dựa trên chi tiêu/ngân sách, thứ hạng và tùy chọn cá nhân.

**Tài khoản dùng:** Sinh viên 1.

**Các bước:**

1. Mở khu vực tips/dashboard; kiểm tra mẹo so sánh với mức trung bình lịch sử hoặc mục tiêu ngân sách.
2. So sánh thứ tự hiển thị và chọn một mẹo để pin.
3. Tải lại trang hoặc đăng nhập lại; xác nhận trạng thái pin được giữ.
4. Dismiss một mẹo khác; tải lại và kiểm tra mẹo không còn ở danh sách đang hiển thị.

**Kết quả mong đợi:** Mẹo liên quan dữ liệu và ngân sách của sinh viên, được xếp hạng theo tác động tiết kiệm; pin/dismiss lưu theo tài khoản và không ảnh hưởng người dùng khác.

| Đạt | Không đạt | Người kiểm | Ngày |
| --- | --------- | ---------- | ---- |
| ☐   | ☐         | -          | -    |

## MT-12 – Ngân sách, tiến độ và cảnh báo

**Mục tiêu:** Kiểm tra ngân sách theo danh mục, progress bar và thông báo gần/vượt ngân sách.

**Tài khoản dùng:** Sinh viên 1.

**Các bước:**

1. Tạo hoặc sửa ngân sách tháng cho một danh mục chi tiêu.
2. Thêm giao dịch để mức sử dụng tiến gần ngưỡng ngân sách; kiểm tra progress bar và thông báo trong ứng dụng.
3. Thêm giao dịch vượt ngưỡng; kiểm tra tiến độ và thông báo.
4. Thử tạo ngân sách với số tiền không hợp lệ hoặc danh mục thu.

**Kết quả mong đợi:** Ngân sách được lưu theo tháng/danh mục; tiến độ cập nhật theo chi tiêu thực tế; thông báo xuất hiện khi gần/vượt ngưỡng và không bị tạo lặp vô lý. Dữ liệu không hợp lệ bị từ chối.

| Đạt | Không đạt | Người kiểm | Ngày |
| --- | --------- | ---------- | ---- |
| ☐   | ☐         | -          | -    |

## MT-13 – Bookmark mẹo và nhận định

**Mục tiêu:** Kiểm tra lưu và truy cập lại các mẹo/nhận định đã đánh dấu.

**Tài khoản dùng:** Sinh viên 1.

**Các bước:**

1. Bookmark một mẹo tiết kiệm và một nhận định tháng.
2. Mở trang bookmarks; xác nhận cả hai mục và nội dung tương ứng hiển thị.
3. Bỏ bookmark một mục, tải lại trang và kiểm tra trạng thái.
4. Đăng nhập tài khoản khác và xác nhận bookmark không bị chia sẻ chéo.

**Kết quả mong đợi:** Mẹo và nhận định được lưu/truy xuất đúng; bỏ bookmark cập nhật trạng thái; bookmark chỉ thuộc về người dùng đã tạo.

| Đạt | Không đạt | Người kiểm | Ngày |
| --- | --------- | ---------- | ---- |
| ☐   | ☐         | -          | -    |

## MT-14 – Bất thường, giao dịch trùng và dự báo

**Mục tiêu:** Kiểm tra gắn cờ giao dịch bất thường/trùng lặp, xử lý cờ và dự báo tháng tới.

**Tài khoản dùng:** Sinh viên 1; Sinh viên 2 để đối chiếu quy tắc định kỳ.

**Các bước:**

1. Tạo giao dịch có số tiền lớn bất thường theo lịch sử và một giao dịch trùng/na ná cùng ngày, số tiền, mô tả.
2. Kiểm tra cảnh báo/cờ trên giao dịch; mở chi tiết và chọn cách xử lý/resolve nếu có.
3. Tạo hoặc kiểm tra quy tắc định kỳ, sau đó mở dự báo tháng tới.
4. Đối chiếu dự báo với xu hướng lịch sử và giao dịch định kỳ; mở hoạt động gần đây để xác nhận giao dịch được xem/chỉnh sửa xuất hiện.

**Kết quả mong đợi:** Giao dịch đáng ngờ được gắn cờ để người dùng xem xét, không tự ý mất dữ liệu; lựa chọn resolve cập nhật trạng thái; dự báo có căn cứ từ xu hướng và giao dịch định kỳ, được trình bày như ước tính chứ không phải giao dịch đã ghi sổ.

| Đạt | Không đạt | Người kiểm | Ngày |
| --- | --------- | ---------- | ---- |
| ☐   | ☐         | -          | -    |

## MT-15 – Trợ năng, điều hướng, sitemap và chatbot

**Mục tiêu:** Kiểm tra tùy chọn hiển thị, breadcrumbs, trạng thái tải, sitemap trang chủ và chatbot trên desktop/điện thoại.

**Tài khoản dùng:** Sinh viên 1; kiểm tra trang chủ khi chưa đăng nhập nếu sitemap được hiển thị công khai.

**Các bước:**

1. Bật dark mode, đổi cỡ chữ; chuyển trang và tải lại để kiểm tra tùy chọn được giữ.
2. Đi qua dashboard và các trang con; kiểm tra breadcrumbs dẫn về đúng cấp và trạng thái tải xuất hiện khi biểu đồ/nhận định đang tạo.
3. Mở trang chủ và kiểm tra sitemap có các nhánh/đường dẫn chính; chọn liên kết và xác nhận điều hướng đúng.
4. Mở chatbot hỗ trợ, gửi câu hỏi thử và kiểm tra widget phản hồi/hiển thị lỗi dịch vụ phù hợp.
5. Lặp lại kiểm tra ở viewport điện thoại; xác nhận không tràn ngang, nội dung/điều khiển không chồng lấn và các liên kết có thể thao tác.

**Kết quả mong đợi:** Dark mode và cỡ chữ hoạt động, được lưu đúng; breadcrumbs chính xác; trạng thái tải không làm treo giao diện; sitemap hiện diện trên trang chủ; chatbot mở và phản hồi hoặc báo không khả dụng rõ ràng. Nội dung dùng được trên màn hình nhỏ.

| Đạt | Không đạt | Người kiểm | Ngày |
| --- | --------- | ---------- | ---- |
| ☐   | ☐         | -          | -    |

## Đối chiếu phạm vi SRS

| Nhóm yêu cầu                                                        | Kịch bản     |
| ------------------------------------------------------------------- | ------------ |
| Đăng ký, xác minh, đăng nhập, phiên, quên/đặt lại mật khẩu          | MT-01        |
| Đăng nhập admin riêng, quản trị danh mục/mẫu/tài khoản/thống kê     | MT-02        |
| Hồ sơ; danh mục thu/chi cá nhân                                     | MT-03        |
| Quick-add; gợi ý, ghi đè và học phân loại AI                        | MT-04        |
| Giao dịch định kỳ                                                   | MT-05        |
| Sửa/xóa/khôi phục, lịch sử và hoạt động gần đây                     | MT-06, MT-14 |
| CSV, gợi ý và phân loại hàng loạt                                   | MT-07        |
| Dashboard và widget                                                 | MT-08        |
| Báo cáo danh mục, thu/chi sáu tháng, ngày/tuần, lọc, PDF/PNG, email | MT-09        |
| Nhận định AI, tăng trưởng, lời khuyên, lịch sử                      | MT-10        |
| Mẹo, xếp hạng, pin/dismiss                                          | MT-11        |
| Ngân sách, tiến độ và cảnh báo                                      | MT-12        |
| Bookmark mẹo/nhận định                                              | MT-13        |
| Bất thường, trùng lặp, dự báo                                       | MT-14        |
| Dark mode, cỡ chữ, breadcrumbs, loading, sitemap, chatbot           | MT-15        |

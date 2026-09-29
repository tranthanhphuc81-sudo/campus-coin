# 3. LỰA CHỌN CÔNG NGHỆ

## 3.1 Nguyên tắc lựa chọn

- **Tuân thủ SRS 1.8:** chỉ chọn trong các ngăn xếp được gợi ý (HTML5, CSS3, Bootstrap, ReactJS; MERN/MEAN; MySQL/SQL Server/MongoDB).

- **Phù hợp bản chất dữ liệu:** dữ liệu tài chính có cấu trúc, quan hệ chặt chẽ, cần tổng hợp theo thời gian và tính toàn vẹn giao dịch (ACID).

- **Một ngôn ngữ xuyên suốt:** TypeScript ở cả frontend và backend giúp chia sẻ schema validate, giảm lỗi kiểu dữ liệu và tăng tốc độ phát triển.

- **Hệ sinh thái trưởng thành, bảo mật tốt:** thư viện phổ biến, được bảo trì, có hỗ trợ dài hạn (LTS).

- **Chi phí vận hành thấp:** chạy được trên một VPS nhỏ bằng Docker Compose, không phụ thuộc dịch vụ trả phí bắt buộc.

## 3.2 Ngăn xếp công nghệ đề xuất

***Bảng 7: Ngăn xếp công nghệ***

| **Tầng**                | **Công nghệ**                                                                     | **Vai trò và lý do lựa chọn**                                                                                         |
|-------------------------|-----------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------|
| Frontend – nền tảng     | React 19 + TypeScript, Vite                                                       | React nằm trong gợi ý SRS; hệ sinh thái biểu đồ/biểu mẫu phong phú; Vite build nhanh, tách code theo route            |
| Frontend – UI           | Bootstrap 5.3 + React-Bootstrap, SCSS                                             | Đáp ứng yêu cầu Bootstrap của SRS; hỗ trợ sẵn color mode (dark/light), grid responsive; tùy biến theme bằng biến SCSS |
| Frontend – định tuyến   | React Router v7                                                                   | Lazy-load route, layout lồng nhau, bảo vệ route theo vai trò, breadcrumbs                                             |
| Frontend – dữ liệu      | TanStack Query v5                                                                 | Cache, đồng bộ, retry, invalidation sau mutation; giảm gọi API thừa                                                   |
| Frontend – biểu mẫu     | React Hook Form + Zod                                                             | Hiệu năng cao; dùng chung schema Zod với backend                                                                      |
| Frontend – biểu đồ      | Chart.js 4 + react-chartjs-2                                                      | Nhẹ, canvas, responsive, hỗ trợ doughnut/bar/line; đủ cho mọi báo cáo SRS                                             |
| Frontend – xuất ảnh     | html-to-image                                                                     | Xuất báo cáo dạng PNG phía client                                                                                     |
| Backend – runtime       | Node.js 24 LTS + TypeScript                                                       | Thuộc ngăn xếp MERN của SRS; LTS đến 2028; I/O bất đồng bộ phù hợp API                                                |
| Backend – framework     | Express 5                                                                         | Framework chuẩn của MERN; Express 5 xử lý lỗi async gốc; middleware bảo mật phong phú                                 |
| Backend – ORM           | Prisma ORM                                                                        | Truy vấn tham số hóa (chống SQL injection), migration có phiên bản, kiểu dữ liệu an toàn                              |
| Backend – validate      | Zod                                                                               | Validate mọi input tại biên API, sinh thông báo lỗi theo trường                                                       |
| Backend – bảo mật       | helmet, cors, express-rate-limit (Redis store), argon2, jose (JWT), otplib (TOTP) | Header bảo mật, CORS allowlist, giới hạn tần suất, băm mật khẩu Argon2id, JWT, MFA cho admin                          |
| Backend – job nền       | BullMQ + Redis                                                                    | Hàng đợi bền vững cho giao dịch định kỳ, sinh nhận định, email, import CSV; retry có backoff                          |
| Backend – CSV/PDF/Email | csv-parse, pdfmake, Nodemailer                                                    | Parse streaming an toàn; sinh PDF không cần trình duyệt headless (nhẹ, an toàn); gửi mail qua SMTP TLS                |
| Backend – logging       | pino + pino-http                                                                  | Log JSON có cấu trúc, redact trường nhạy cảm, hiệu năng cao                                                           |
| Cơ sở dữ liệu           | MySQL 8.4 LTS (InnoDB, utf8mb4)                                                   | Có trong gợi ý SRS; ACID, khóa ngoại, CHECK, JSON column, window functions cho báo cáo                                |
| Cache / Queue           | Redis 7.x                                                                         | Cache dashboard, lưu bộ đếm rate limit, hàng đợi BullMQ, pub/sub cho SSE nhiều instance                               |
| AI / ML                 | LLM qua AI Adapter (mặc định Google Gemini Flash; thay thế OpenAI mini-class)     | Chi phí thấp, hỗ trợ đầu ra JSON theo schema; adapter cho phép đổi nhà cung cấp; có fallback quy tắc                  |
| Chatbot                 | Tawk.to                                                                           | Được SRS gợi ý; miễn phí; nhúng widget, cấu hình FAQ/shortcut                                                         |
| Hạ tầng                 | Docker Compose, Nginx, Ubuntu 24.04 LTS, Cloudflare                               | Triển khai lặp lại được; reverse proxy + TLS; WAF/DDoS miễn phí                                                       |
| CI/CD & chất lượng      | GitHub Actions, ESLint, Vitest, Supertest, Playwright, k6, OWASP ZAP              | Tự động kiểm tra, kiểm thử, quét bảo mật trước khi triển khai                                                         |
| Giám sát                | Sentry, UptimeRobot, Prometheus exporter (tùy chọn)                               | Theo dõi lỗi, uptime 24/7, cảnh báo                                                                                   |

> **Ghi chú:** Phiên bản cụ thể của thư viện được khóa trong package-lock.json và cập nhật định kỳ qua Dependabot. Luôn dùng bản vá bảo mật mới nhất của các phiên bản chính nêu trên.

## 3.3 Các quyết định kiến trúc quan trọng (ADR)

***Bảng 8: Nhật ký quyết định kiến trúc***

| **Mã** | **Quyết định**                                                                         | **Phương án cân nhắc**                         | **Lý do chọn**                                                                                                                                                                                                                   |
|--------|----------------------------------------------------------------------------------------|------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| ADR-01 | Dùng MySQL thay vì MongoDB                                                             | MongoDB (MERN thuần), SQL Server               | Dữ liệu tài chính có quan hệ (user–category–transaction–budget); cần ACID khi nhập CSV hàng loạt; báo cáo cần GROUP BY/SUM theo thời gian; ràng buộc khóa ngoại và CHECK bảo vệ toàn vẹn. MySQL miễn phí, phổ biến, có trong SRS |
| ADR-02 | React thay vì Angular                                                                  | Angular                                        | Hệ sinh thái biểu đồ/form nhẹ hơn; bundle nhỏ hơn cho mobile; nằm trong gợi ý MERN                                                                                                                                               |
| ADR-03 | Modular monolith                                                                       | Microservices                                  | Quy mô đội nhỏ, thời gian ngắn; ranh giới module rõ ràng, giao tiếp qua service interface và domain events → có thể tách service về sau                                                                                          |
| ADR-04 | JWT access token ngắn hạn trong bộ nhớ + refresh token xoay vòng trong cookie HttpOnly | Session server-side; JWT lưu localStorage      | Không lộ token cho JavaScript (chống XSS đánh cắp token), stateless cho API, thu hồi được nhờ refresh token lưu DB, phát hiện token bị đánh cắp qua reuse detection                                                              |
| ADR-05 | AI phân loại 3 tầng (luật cá nhân → từ khóa → LLM)                                     | Chỉ dùng LLM; tự huấn luyện mô hình ML         | Nhanh và miễn phí cho đa số trường hợp; học từ sửa đổi của người dùng; LLM chỉ dùng khi cần; vẫn hoạt động khi LLM lỗi                                                                                                           |
| ADR-06 | Số liệu nhận định do backend tính, LLM chỉ viết lời văn                                | Gửi toàn bộ giao dịch cho LLM                  | Chống "bịa số" (hallucination), bảo vệ quyền riêng tư, giảm chi phí token, kết quả kiểm chứng được                                                                                                                               |
| ADR-07 | Server-Sent Events cho thông báo                                                       | WebSocket, polling                             | Chỉ cần đẩy một chiều; SSE đơn giản, tự reconnect, đi qua HTTP/Nginx dễ dàng; polling 60 giây làm dự phòng                                                                                                                       |
| ADR-08 | BullMQ + Redis cho tác vụ nền                                                          | node-cron trong tiến trình API                 | Job bền vững khi restart, retry/backoff, giới hạn đồng thời, không chạy trùng khi có nhiều instance API                                                                                                                          |
| ADR-09 | Sinh PDF bằng pdfmake phía server                                                      | Puppeteer (Chrome headless), jsPDF phía client | Nhẹ, không cần trình duyệt headless (giảm bề mặt tấn công), nhất quán giữa xuất file và gửi email                                                                                                                                |
| ADR-10 | UUID v7 cho khóa chính của user/transaction                                            | INT auto-increment                             | Không đoán được ID (giảm rủi ro IDOR/liệt kê), vẫn tăng dần theo thời gian nên thân thiện chỉ mục B-tree                                                                                                                         |

## 3.4 Phương án AI và chatbot

Theo SRS, AI là tính năng tùy chọn gồm hai năng lực: **(1) phân loại chi tiêu tự động** và **(2) sinh nhận định chi tiêu hằng tháng**. Thiết kế tuân theo ba nguyên tắc: AI là trợ lý (người dùng luôn xem lại và ghi đè), AI có thể tắt (opt-in trong hồ sơ, mặc định tắt gửi dữ liệu ra ngoài), và hệ thống vẫn hoạt động đầy đủ khi AI không khả dụng.

***Bảng 9: Các năng lực AI***

| **Năng lực**                     | **Kỹ thuật chính**                                                                                                      | **Dự phòng khi AI lỗi**                                                             |
|----------------------------------|-------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------|
| Gợi ý danh mục khi gõ mô tả      | Tầng 1: luật học từ người dùng; Tầng 2: từ điển từ khóa; Tầng 3: LLM với đầu ra JSON ràng buộc trong danh sách danh mục | Tầng 1–2 luôn chạy cục bộ; nếu LLM timeout (3 giây) trả về rỗng, người dùng tự chọn |
| Phân loại hàng loạt khi nhập CSV | Như trên, gọi LLM theo lô 50 mô tả, cache theo merchant key                                                             | Dòng không phân loại được gán "Miscellaneous" và đánh dấu để người dùng xem lại     |
| Học từ sửa đổi                   | Upsert bảng ai_category_rules (merchant key → danh mục, hit_count)                                                      | Không phụ thuộc LLM                                                                 |
| Nhận định hằng tháng             | Stats engine tính tăng trưởng, z-score; LLM viết tóm tắt ≤ 120 từ + 1 lời khuyên từ JSON tổng hợp                       | Template tiếng Việt/Anh dựng sẵn điền số liệu                                       |
| Chatbot hỗ trợ                   | Widget Tawk.to với kịch bản FAQ (cách thêm giao dịch, nhập CSV, đặt ngân sách…)                                         | Trang Trợ giúp/FAQ tĩnh                                                             |
| OCR hóa đơn (mở rộng)            | Tesseract.js phía client đọc số tiền/ngày từ ảnh hóa đơn                                                                | Nhập tay                                                                            |

<!-- Trích từ Tài liệu thiết kế kỹ thuật Campus Coin v1.0 (bản đã sửa). Nguồn gốc: file Word. Không sửa trực tiếp ở đây nếu chưa cập nhật file Word. -->

# 9. BẢO MẬT VÀ AN TOÀN DỮ LIỆU

## 9.1 Mục tiêu và nguyên tắc

Campus Coin lưu dữ liệu tài chính cá nhân – loại dữ liệu nhạy cảm. Mục tiêu bảo mật là bảo đảm **tính bí mật** (chỉ chủ sở hữu xem được dữ liệu của mình – yêu cầu SRS), **tính toàn vẹn** (dữ liệu không bị sửa trái phép, lịch sử đầy đủ) và **tính sẵn sàng** (24/7). Thiết kế tuân thủ các nguyên tắc:

- **Phòng thủ nhiều lớp (Defense in depth):** mỗi lớp giả định lớp trước có thể bị vượt qua.

- **Đặc quyền tối thiểu (Least privilege):** cho người dùng, admin, tài khoản DB, container và token.

- **Mặc định an toàn (Secure by default):** AI opt-in mặc định tắt, cookie Secure/HttpOnly, CSP chặt, cổng DB đóng.

- **Quyền riêng tư từ thiết kế (Privacy by design):** tối thiểu hóa dữ liệu, ẩn danh khi gửi ra ngoài, admin không xem giao dịch cá nhân.

- **Không tin tưởng đầu vào:** mọi dữ liệu từ client, file CSV và đầu ra LLM đều được validate.

- **Kiểm toán được:** mọi hành động nhạy cảm đều được ghi log bất biến.

## 9.2 Kiến trúc bảo mật nhiều lớp

***Hình 26: Mô hình phòng thủ nhiều lớp*** — ảnh: [images/hinh-26.png](images/hinh-26.png) — mã nguồn sơ đồ: [diagrams/v1_0_Hinh_26.mmd](diagrams/v1_0_Hinh_26.mmd)

## 9.3 Phân loại dữ liệu

***Hình 27: Phân loại dữ liệu và biện pháp bảo vệ tương ứng*** — mã nguồn Mermaid: [diagrams/v1_0_Hinh_27.mmd](diagrams/v1_0_Hinh_27.mmd); ảnh: [images/hinh-27.png](images/hinh-27.png)

***Bảng 51: Ma trận phân loại dữ liệu***

| **Mức** | **Dữ liệu** | **Lưu trữ** | **Truyền tải** | **Truy cập** |
| --- | --- | --- | --- | --- |
| Bí mật | Mật khẩu, token, khóa JWT, khóa AI, thông tin DB | Băm một chiều (Argon2id/SHA-256); khóa chỉ nằm trong biến môi trường | Không bao giờ trả về qua API, không ghi log | Chỉ tiến trình ứng dụng |
| Nhạy cảm | Email, họ tên, giao dịch, mô tả, ngân sách, mục tiêu, nhận định | MySQL trên volume mã hóa; backup mã hóa | TLS 1.2+; tới LLM chỉ dạng tổng hợp/đã làm sạch | Chủ sở hữu; admin chỉ thấy thông tin tài khoản |
| Nội bộ | Audit log, thống kê, cấu hình | MySQL, IP được băm HMAC | TLS | Admin (chỉ đọc) |
| Công khai | Danh mục mặc định, trang giới thiệu, thông báo hệ thống | Bình thường | TLS, cache CDN | Mọi người |

## 9.4 Mô hình hóa mối đe dọa (STRIDE)

***Bảng 52: Phân tích STRIDE***

| **Mối đe dọa** | **Kịch bản ví dụ** | **Biện pháp giảm thiểu** |
| --- | --- | --- |
| S – Giả mạo (Spoofing) | Dò mật khẩu (brute force, credential stuffing); đánh cắp token | Argon2id, rate limit theo IP+email, khóa tạm thời, chặn mật khẩu bị lộ, refresh token xoay vòng + phát hiện dùng lại, cookie HttpOnly |
| T – Sửa đổi trái phép (Tampering) | Sửa giao dịch của người khác qua ID; sửa JWT; chèn công thức vào CSV | Kiểm tra sở hữu ở repository, UUID v7, JWT ký và kiểm tra thuật toán cố định, validate Zod, trung hòa công thức CSV, khóa lạc quan |
| R – Chối bỏ (Repudiation) | Admin vô hiệu hóa tài khoản rồi phủ nhận | Audit log bất biến (DB user chỉ INSERT), kèm requestId, thời gian UTC, actor |
| I – Lộ thông tin (Information disclosure) | IDOR; lỗi trả stack trace; dò email khi đăng ký; lộ dữ liệu qua LLM; log chứa token | 404 cho tài nguyên người khác, thông điệp lỗi chung, không log dữ liệu bí mật (pino redact), làm sạch PII trước khi gọi LLM, TLS, CSP |
| D – Từ chối dịch vụ (DoS) | Spam API; upload CSV lớn; gọi LLM tốn chi phí | Rate limit ở Nginx và API, giới hạn body 2 MB, giới hạn số dòng CSV, timeout, quota LLM theo người dùng |
| E – Leo thang đặc quyền (Elevation) | Sinh viên gọi API admin; mass assignment trường role | RBAC middleware, schema Zod whitelist trường (không nhận role/status từ client), cổng admin tách biệt |

## 9.5 Xác thực

***Bảng 53: Thiết kế xác thực***

| **Hạng mục** | **Thiết kế** |
| --- | --- |
| Băm mật khẩu | Argon2id (memory 19 MiB, iterations 2, parallelism 1 – theo khuyến nghị OWASP); salt ngẫu nhiên do thư viện sinh; tự động băm lại khi tăng tham số |
| Chính sách mật khẩu | 10–128 ký tự, cho phép mọi ký tự Unicode và cụm mật khẩu; chặn top 10.000 mật khẩu phổ biến và kiểm tra rò rỉ qua API k-anonymity (Have I Been Pwned, chỉ gửi 5 ký tự đầu của SHA-1); không bắt đổi định kỳ |
| Access token | JWT ký EdDSA (Ed25519) hoặc HS256 với khóa ≥ 256-bit; thời hạn 15 phút (admin 10 phút); claim tối thiểu: sub, role, sid, iat, exp, iss, aud; có kid để xoay khóa; server chỉ chấp nhận đúng thuật toán đã cấu hình |
| Refresh token | Chuỗi ngẫu nhiên 256-bit (CSPRNG), lưu SHA-256; cookie HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth; xoay vòng mỗi lần dùng; dùng lại token cũ → thu hồi cả family và ghi audit |
| Chống brute force | Rate limit (mục 7.4) + khóa tăng dần sau 5 lần sai; thời gian phản hồi đồng nhất khi email không tồn tại (vẫn chạy băm giả) |
| Xác minh email | Bắt buộc trước khi dùng tính năng gửi email/chia sẻ; token 24 giờ, dùng một lần |
| Đăng xuất | Thu hồi refresh token trong DB, xóa cookie; access token tự hết hạn sau tối đa 15 phút; thao tác nhạy cảm (đổi mật khẩu, xóa tài khoản) yêu cầu nhập lại mật khẩu |

## 9.6 Phân quyền

Phân quyền hai lớp: **RBAC** theo vai trò (guest, student, admin) ở middleware authorize, và **kiểm tra quyền sở hữu** ở lớp repository – mọi truy vấn dữ liệu người dùng luôn kèm điều kiện user_id = <sub trong token>. Tài nguyên không thuộc người gọi trả về 404 để không tiết lộ sự tồn tại. Có bộ test tự động "cross-tenant" cho mọi endpoint: người dùng A thử đọc/sửa/xóa dữ liệu của B phải thất bại.

***Bảng 54: Ma trận phân quyền***

| **Chức năng** | **Guest** | **Student** | **Admin** |
| --- | --- | --- | --- |
| Xem trang công khai, sitemap | ✔ | ✔ | ✔ |
| Đăng ký / đăng nhập sinh viên | ✔ | – | – |
| CRUD giao dịch, ngân sách, bookmark của mình | – | ✔ | – |
| CRUD danh mục cá nhân | – | ✔ (của mình) | – |
| Xem báo cáo, nhận định, mẹo của mình | – | ✔ | – |
| Xem giao dịch của người khác | – | ✘ | ✘ |
| CRUD danh mục mặc định, mẫu mẹo, thông báo | – | ✘ | ✔ |
| Xem danh sách tài khoản, vô hiệu hóa, gửi link reset | – | ✘ | ✔ |
| Xem thống kê tổng hợp, audit log | – | ✘ | ✔ |

## 9.7 Bảo vệ ứng dụng theo OWASP Top 10

***Bảng 55: Ánh xạ OWASP Top 10***

| **Rủi ro OWASP** | **Biện pháp trong Campus Coin** |
| --- | --- |
| A01 Broken Access Control | RBAC + kiểm tra sở hữu ở repository, 404 cho tài nguyên người khác, UUID v7, test cross-tenant tự động, CORS allowlist, không để lộ API admin cho token sinh viên |
| A02 Cryptographic Failures | TLS 1.2+/HSTS preload, Argon2id, token chỉ lưu dạng băm, khóa lưu ngoài mã nguồn, tắt cipher yếu |
| A03 Injection | Prisma truy vấn tham số hóa (cấm raw query không tham số), validate Zod whitelist, escape đầu ra, CSP chặn inline script, trung hòa CSV formula injection |
| A04 Insecure Design | Threat modeling STRIDE, quy tắc nghiệp vụ giới hạn (quota LLM, số danh mục, số email chia sẻ), luồng reset mật khẩu an toàn |
| A05 Security Misconfiguration | helmet, container non-root/read-only, tắt X-Powered-By, không bật Swagger ở production, cấu hình qua biến môi trường được validate, CIS hardening cho VPS |
| A06 Vulnerable Components | Khóa phiên bản (lockfile), Dependabot, npm audit trong CI, chặn merge khi có lỗ hổng High/Critical |
| A07 Identification & Authentication Failures | Mục 9.5: chính sách mật khẩu NIST, rate limit, khóa tạm, refresh rotation, thu hồi phiên khi đổi mật khẩu |
| A08 Software & Data Integrity Failures | Image ký theo git SHA, CI chạy trên nhánh được bảo vệ, không tải script bên thứ ba không kiểm soát (Tawk.to được khai báo CSP, SRI cho tài nguyên CDN) |
| A09 Security Logging & Monitoring Failures | Audit log sự kiện đăng nhập/thất bại/admin; cảnh báo khi đăng nhập thất bại tăng đột biến hoặc phát hiện token reuse; Sentry |
| A10 Server-Side Request Forgery | Máy chủ chỉ gọi ra danh sách host cố định (LLM, SMTP, Sentry, HIBP); không có tính năng tải URL do người dùng cung cấp |

## 9.8 Bảo vệ dữ liệu khi truyền và khi lưu trữ

- **Khi truyền: HTTPS bắt buộc (Let's Encrypt trên Nginx), TLS 1.2/1.3, HSTS; kết nối SMTP dùng STARTTLS/TLS; kết nối DB chỉ trong mạng Docker nội bộ.**

- **Khi lưu trữ: mật khẩu và token chỉ lưu dạng băm; MySQL không mở cổng ra ngoài; bản sao lưu được chép ra ngoài VPS và chỉ nhóm quản trị truy cập.**

- **Quản lý bí mật: file .env không commit vào Git; khóa JWT, khóa AI và mật khẩu DB chỉ nằm trong biến môi trường và được đổi khi nghi bị lộ.**

- **Tối thiểu hóa dữ liệu:** không thu thập số điện thoại, địa chỉ, số tài khoản ngân hàng; IP lưu dạng HMAC; email được che một phần trong giao diện admin.

## 9.9 An toàn khi sử dụng AI

***Bảng 56: Kiểm soát rủi ro AI***

| **Rủi ro** | **Biện pháp** |
| --- | --- |
| Lộ dữ liệu cá nhân cho bên thứ ba | Opt-in rõ ràng; không gửi tên/email; mô tả giao dịch được lọc email, số điện thoại, dãy số dài (số tài khoản/thẻ) bằng regex trước khi gửi; nhận định chỉ gửi số liệu tổng hợp; chọn gói API cam kết không dùng dữ liệu để huấn luyện |
| Prompt injection qua mô tả giao dịch | Mô tả được đặt trong khối dữ liệu có ranh giới, chỉ dẫn hệ thống yêu cầu coi đó là dữ liệu; đầu ra bị ràng buộc JSON schema và danh mục phải thuộc danh sách hợp lệ; đầu ra không bao giờ được thực thi hay dùng để gọi công cụ |
| Ảo giác (bịa số liệu) | Số liệu do backend tính; kiểm tra mọi con số trong văn bản khớp đầu vào; không khớp → template |
| Nội dung không phù hợp / lời khuyên tài chính rủi ro | Ràng buộc prompt (không khuyên đầu tư, vay), bộ lọc từ khóa, nhãn "for reference only" (SRS 1.5) |
| XSS qua đầu ra AI | Hiển thị văn bản thuần, React tự escape, không dùng HTML từ AI |
| Lạm dụng chi phí | Quota theo người dùng, cache, timeout, circuit breaker, cảnh báo ngân sách API |

## 9.10 An toàn tải lên và tải xuống file

SRS yêu cầu ứng dụng "không gây ra tải xuống độc hại hoặc tải xuống không cần thiết". Thiết kế:

- **Tải lên CSV:** chỉ chấp nhận đuôi .csv và MIME text/csv hoặc text/plain; kiểm tra nội dung là văn bản UTF-8 (từ chối byte nhị phân); giới hạn 2 MB/5.000 dòng/50 cột/1.000 ký tự mỗi ô; file xử lý trong bộ nhớ theo luồng, **không lưu file gốc lên đĩa**, tên file gốc chỉ lưu sau khi làm sạch.

- **CSV/Formula injection:** khi xuất CSV, ô bắt đầu bằng =, +, -, @, tab hoặc CR được thêm tiền tố nháy đơn để bảng tính không thực thi công thức.

- **Tải xuống:** chỉ sinh PDF/PNG/CSV/JSON do chính hệ thống tạo, gửi với Content-Disposition: attachment, X-Content-Type-Options: nosniff và tên file an toàn; chỉ tải khi người dùng chủ động nhấn nút; không có tải xuống tự động.

- Không cho phép tải lên file thực thi, ảnh SVG hoặc HTML; tính năng OCR (mở rộng) xử lý ảnh hoàn toàn phía client.

## 9.11 Header bảo mật HTTP và cấu hình

***Bảng 57: Cấu hình header bảo mật***

| **Header / Cấu hình** | **Giá trị** |
| --- | --- |
| Content-Security-Policy | Chỉ cho phép script, style và kết nối từ chính ứng dụng và các domain của Tawk.to; cấm nhúng trang vào iframe của site khác. |
| Strict-Transport-Security | max-age=31536000; includeSubDomains; preload |
| X-Content-Type-Options | nosniff |
| Referrer-Policy | strict-origin-when-cross-origin |
| Permissions-Policy | camera=(), microphone=(), geolocation=(), payment=() |
| Cross-Origin-Opener-Policy | same-origin |
| Cookie refresh token | HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth; tiền tố __Host- khi không dùng Path riêng |
| CORS | Chỉ cho phép origin của frontend; credentials chỉ cho /auth/refresh; không dùng wildcard |
| CSRF | API dùng Bearer token nên miễn nhiễm CSRF; riêng /auth/refresh và /auth/logout (dùng cookie) được bảo vệ bằng SameSite=Strict + kiểm tra header Origin + header tùy biến bắt buộc |
| Cache-Control | no-store cho mọi phản hồi API chứa dữ liệu cá nhân; tài nguyên tĩnh có hash được cache 1 năm |

## 9.12 Nhật ký kiểm toán và giám sát bảo mật

***Bảng 58: Sự kiện kiểm toán***

| **Nhóm sự kiện** | **Ví dụ action** | **Cảnh báo** |
| --- | --- | --- |
| Xác thực | auth.login.success / failed, auth.locked, auth.refresh.reuse_detected, auth.password.reset | ≥ 50 lần đăng nhập thất bại/5 phút toàn hệ thống; mọi reuse_detected |
| Tài khoản | user.register, user.email.verified, user.export, user.delete.requested | Xuất dữ liệu bất thường nhiều lần |
| Quản trị | admin.login, admin.login.failed, admin.user.disable/enable, admin.category.*, admin.template.* | Nhiều admin.login.failed liên tiếp; đăng nhập admin từ IP mới |
| Dữ liệu | import.committed, transaction.bulk_delete | Xóa hàng loạt > 100 bản ghi |
| Hệ thống | job.failed, ai.provider.error, backup.failed | Backup thất bại; tỷ lệ lỗi AI > 20% |

Log ứng dụng dạng JSON (pino) với requestId; các trường password, token, authorization, cookie bị redact tự động. Log lưu bằng Docker log driver (xoay vòng file), giữ 30 ngày.

## 9.13 Sao lưu và phục hồi

***Bảng 59: Chiến lược sao lưu và phục hồi***

| **Hạng mục** | **Thiết kế** |
| --- | --- |
| Sao lưu đầy đủ | mysqldump --single-transaction lúc 02:00 hằng ngày bằng cron trên VPS, nén và chép ra ngoài VPS; giữ 7 bản gần nhất |
| RPO / RTO | RPO ≤ 24 giờ; RTO ≤ 2 giờ |
| Kiểm thử phục hồi | Khôi phục thử bản sao lưu vào máy local và chạy smoke test trước buổi demo |
| Cấu hình & mã | Mã nguồn và cấu hình hạ tầng trên Git; image lưu trên GHCR theo git SHA; tái dựng máy chủ mới bằng script trong < 1 giờ |

## 9.14 Quyền riêng tư và vòng đời dữ liệu người dùng

- Trang Chính sách quyền riêng tư và Điều khoản sử dụng nêu rõ dữ liệu thu thập, mục đích, bên thứ ba (LLM, SMTP), thời gian lưu và quyền của người dùng; người dùng đồng ý khi đăng ký.

- **Quyền truy cập và di chuyển dữ liệu:** xuất toàn bộ dữ liệu (JSON + CSV giao dịch) từ trang Cài đặt.

- **Quyền xóa:** yêu cầu xóa tài khoản → vô hiệu hóa ngay, thu hồi phiên, xóa vĩnh viễn sau 30 ngày; audit log liên quan được ẩn danh.

- **Quyền rút lại đồng ý AI:** tắt ai_opt_in có hiệu lực ngay; các nhận định sau đó dùng template.

- Thiết kế hướng tới tuân thủ Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân (Việt Nam) và các nguyên tắc GDPR khi có người dùng quốc tế.

## 9.15 Quy trình ứng phó sự cố

- **Phát hiện:** cảnh báo từ Sentry/UptimeRobot/audit log hoặc báo cáo người dùng.

- **Ngăn chặn:** vô hiệu hóa tài khoản/khóa bị lộ, thu hồi toàn bộ refresh token (đăng xuất toàn hệ thống), xoay khóa JWT, bật chế độ bảo trì nếu cần.

- **Điều tra:** thu thập log theo requestId, xác định phạm vi dữ liệu bị ảnh hưởng.

- **Khắc phục:** vá lỗ hổng, triển khai lại, khôi phục dữ liệu từ backup nếu dữ liệu bị sửa.

- **Thông báo:** thông báo người dùng bị ảnh hưởng và cơ quan chức năng theo quy định (trong 72 giờ).

- **Rút kinh nghiệm:** báo cáo sau sự cố, cập nhật threat model và test hồi quy.

## 9.16 Bảo mật chuỗi cung ứng và DevSecOps

- Nhánh main được bảo vệ: bắt buộc Pull Request, review, CI xanh; commit ký GPG khuyến khích.

- CI chạy: ESLint (plugin security), kiểm tra kiểu TypeScript, test và npm audit trên mỗi Pull Request.

- Image dựa trên bản alpine/distroless chính thức, build nhiều giai đoạn, chạy non-root, quét lỗ hổng trước khi đẩy lên registry.

- Script bên thứ ba (Tawk.to) chỉ tải trên trang cần thiết, được khai báo trong CSP; font và thư viện frontend tự host để tránh phụ thuộc CDN.

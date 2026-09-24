---
name: p16-3-security-audit
description: "🔴 P16.3 – Rà soát bảo mật toàn diện"
agent: agent
---
# P16.3 – Rà soát bảo mật toàn diện

> **Cấp AI: 🔴 Cao cấp/suy luận** – Cần tư duy như kẻ tấn công trên toàn bộ codebase; mô hình rẻ thường bỏ sót lỗi logic phân quyền.

Tuân thủ toàn bộ quy tắc trong AGENTS.md (đã được nạp tự động).

## Tài liệu tham chiếu (đọc trước khi làm)

- [docs/design/09-bao-mat.md](../../docs/design/09-bao-mat.md)

Tập trung vào: chương 9 Bảo mật; cho AI truy cập toàn bộ thư mục api/src và web/src (agent tự đọc codebase).

## Nhiệm vụ

Bạn là chuyên gia kiểm thử xâm nhập. Rà soát TOÀN BỘ mã nguồn theo OWASP Top 10 (2021) và OWASP API Security Top 10 (2023). Đặc biệt kiểm tra:
1. Mọi truy vấn Prisma/$queryRaw có lọc userId không; có chỗ nào nhận userId, role, status từ client không (mass assignment).
2. $queryRaw có chỗ nào nối chuỗi thay vì tham số hóa không.
3. Luồng refresh token, reset mật khẩu, xác minh email: có thể dùng lại token, đoán token, hay khóa tài khoản người khác không.
4. XSS: có dangerouslySetInnerHTML hay render HTML từ tip template/announcement/nhận định LLM không.
5. Nhập CSV: CSV injection, file lớn, zip bomb đổi đuôi, ký tự điều khiển.
6. Prompt injection qua mô tả giao dịch tới LLM; PII có lọt ra ngoài không.
7. Rate limit có bị bỏ qua bằng cách đổi header (X-Forwarded-For) không – kiểm tra cấu hình trust proxy.
8. Header bảo mật, CORS, cookie flags, thông báo lỗi có lộ stack/thông tin nội bộ không.
9. Secrets có bị commit hoặc log không.
KHÔNG sửa code. Trả về bảng: Mức độ (Critical/High/Medium/Low) | Vị trí (file:dòng) | Mô tả | Cách khai thác | Cách sửa đề xuất. Sắp xếp theo mức độ.

## Cách ghi kết quả

Ghi bảng kết quả vào `docs/security/security-audit.md` (tạo mới nếu chưa có). KHÔNG sửa file code nào.

## Kết thúc

In: (1) giả định đã đặt, (2) chỗ đội cần tự kiểm tra, (3) lệnh để chạy/kiểm thử, (4) một dòng đề xuất cho docs/ai-usage-log.md.

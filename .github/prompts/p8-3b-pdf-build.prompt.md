---
name: p8-3b-pdf-build
description: "🔵 P8.3-B – Hiện thực xuất PDF và chia sẻ email"
agent: agent
---
# P8.3-B – Hiện thực xuất PDF và chia sẻ email

> **Cấp AI: 🔵 Tầm trung agentic** – Nhiều file (renderer, biểu đồ, route, mailer) theo quyết định đã chốt.

Tuân thủ toàn bộ quy tắc trong AGENTS.md (đã được nạp tự động).

## Tài liệu tham chiếu (đọc trước khi làm)

- [docs/design/05-thiet-ke-chuc-nang.md](../../docs/design/05-thiet-ke-chuc-nang.md)
- [docs/design/07-thiet-ke-api.md](../../docs/design/07-thiet-ke-api.md)
- [docs/decisions/ADR-PDF-01.md](../../docs/decisions/ADR-PDF-01.md)

Tập trung vào: ADR-PDF-01, mục 5.8, 7.3.3 (export, share), 7.4.

**Điều kiện tiên quyết:** các file `docs/decisions/ADR-PDF-01.md` phải tồn tại và có trạng thái `Accepted`. Nếu chưa, DỪNG và nhắc người dùng chạy prompt bước A tương ứng.

## Nhiệm vụ

- api/src/integrations/pdf: renderMonthlyReport(userId, month) theo ADR-PDF-01, dùng lại truy vấn của module analytics.
- GET /reports/monthly/export?month=&format=pdf: Content-Disposition attachment, tên file campus-coin-report-YYYY-MM.pdf, chỉ dữ liệu của chính người dùng.
- POST /reports/monthly/share {month, toEmail}: rate limit 5/ngày/người dùng; gửi PDF đính kèm qua mailer; nội dung email không chứa link công khai tới dữ liệu.
- Frontend: nút "Export PDF" (tải file khi người dùng bấm) và modal "Share via email".
Test: PDF sinh ra > 0 byte và có header %PDF; gọi share lần thứ 6 trong ngày → 429.

## Kết thúc

In: (1) giả định đã đặt, (2) chỗ đội cần tự kiểm tra, (3) lệnh để chạy/kiểm thử, (4) một dòng đề xuất cho docs/ai-usage-log.md.

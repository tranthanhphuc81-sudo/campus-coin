---
name: p11-1b-insights-build
description: "🔵 P11.1-B – Hiện thực nhận định (backend + frontend)"
agent: agent
---
# P11.1-B – Hiện thực nhận định (backend + frontend)

> **Cấp AI: 🔵 Tầm trung agentic** – Nhiều phần (stats engine, validator, job cron, API, trang lịch sử) bám theo ADR.

Tuân thủ toàn bộ quy tắc trong AGENTS.md (đã được nạp tự động).

## Tài liệu tham chiếu (đọc trước khi làm)

- [docs/design/07-thiet-ke-api.md](../../docs/design/07-thiet-ke-api.md)
- [docs/decisions/ADR-INSIGHT-01.md](../../docs/decisions/ADR-INSIGHT-01.md)

Tập trung vào: ADR-INSIGHT-01, mục 7.3.3 (/insights).

**Điều kiện tiên quyết:** các file `docs/decisions/ADR-INSIGHT-01.md` phải tồn tại và có trạng thái `Accepted`. Nếu chưa, DỪNG và nhắc người dùng chạy prompt bước A tương ứng.

## Nhiệm vụ

- api/src/modules/insights/{stats.ts, validator.ts, templates.ts, insight.service.ts, routes.ts}: hiện thực đúng ADR; stats.ts và validator.ts là hàm thuần để unit test.
- api/src/jobs/insights.ts: node-cron 00:30 ngày 1 hằng tháng cho user active có ≥ 5 giao dịch tháng trước; xử lý tuần tự từng user, lỗi một user không dừng lượt chạy; upsert insights UNIQUE(user_id, month); tạo notification insight_ready.
- GET /insights, GET /insights/:month, POST /insights/:month/regenerate (≤ 3 lần/tháng, 202).
- Frontend: trang Nhận định (danh sách theo tháng, chi tiết có các mẫu đã flag dạng thẻ, nhãn "AI-generated insight – for reference only", nút "Regenerate", nút Bookmark); widget "Nhận định mới nhất" trên dashboard.
Unit test dùng 3 bộ dữ liệu ví dụ trong ADR; test validator bắt được câu "chi Food tăng 55%" khi số liệu thật là 40%.

## Kết thúc

In: (1) giả định đã đặt, (2) chỗ đội cần tự kiểm tra, (3) lệnh để chạy/kiểm thử, (4) một dòng đề xuất cho docs/ai-usage-log.md.

---
name: p12-1-tips-engine
description: "🔵 P12.1 – Tips engine R0–R6 (backend + frontend)"
agent: agent
---
# P12.1 – Tips engine R0–R6 (backend + frontend)

> **Cấp AI: 🔵 Tầm trung agentic** – Thuật toán đã được đặc tả rõ trong tài liệu (bảng quy tắc, công thức score) nên không cần bước quyết định riêng, nhưng nhiều quy tắc và test.

Tuân thủ toàn bộ quy tắc trong AGENTS.md (đã được nạp tự động).

## Tài liệu tham chiếu (đọc trước khi làm)

- [docs/design/05-thiet-ke-chuc-nang.md](../../docs/design/05-thiet-ke-chuc-nang.md)
- [docs/design/06-thiet-ke-co-so-du-lieu.md](../../docs/design/06-thiet-ke-co-so-du-lieu.md)

Tập trung vào: mục 5.10 (bảng quy tắc R0–R6 và công thức), 6.3.6 (tip_templates, user_tips), Hình 20.

## Nhiệm vụ

Backend api/src/modules/tips:
- rules/*.ts: mỗi quy tắc R1–R6 là một hàm thuần evaluate(context) → TipCandidate[] {ruleType, categoryId?, impactAmount, variables}. context gồm: chi tiêu tháng này theo danh mục, spent_to_date, số ngày đã qua, avg3, budgets, giao dịch 7 ngày gần nhất, recurring subscriptions, thu tháng này, mục tiêu tiết kiệm, trợ cấp cơ sở.
- projected(c) chỉ áp dụng từ ngày thứ 5 của tháng. confidence theo số tháng lịch sử (0,5 / 0,75 / 1,0). score = impact × confidence × recency.
- tips.service.ts: tính lại khi người dùng mở dashboard/trang Mẹo nếu lần tính gần nhất > 10 phút; render nội dung từ tip_templates (escape mọi biến); lưu user_tips; bỏ tip dismissed trong 30 ngày (cùng quy tắc + danh mục); tip pinned luôn đứng đầu.
- GET /tips, POST /tips/:id/pin | unpin | dismiss. Bổ sung top 3 tips vào /dashboard/summary.
Frontend: widget Top 3 mẹo trên dashboard (nút Pin / Dismiss / Save), trang Mẹo xem tất cả.
Unit test từng quy tắc với dữ liệu biên (ngày thứ 4 của tháng không kích hoạt R1/R2; đúng 8 khoản nhỏ kích hoạt R3; 3 subscription kích hoạt R4).

## Kết thúc

In: (1) giả định đã đặt, (2) chỗ đội cần tự kiểm tra, (3) lệnh để chạy/kiểm thử, (4) một dòng đề xuất cho docs/ai-usage-log.md.

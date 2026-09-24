---
name: p8-1-analytics-api
description: "🔵 P8.1 – Truy vấn tổng hợp và API dashboard/báo cáo"
agent: agent
---
# P8.1 – Truy vấn tổng hợp và API dashboard/báo cáo

> **Cấp AI: 🔵 Tầm trung agentic** – Nhiều truy vấn SQL tổng hợp phải đúng múi giờ và dùng đúng chỉ mục.

Tuân thủ toàn bộ quy tắc trong AGENTS.md (đã được nạp tự động).

## Tài liệu tham chiếu (đọc trước khi làm)

- [docs/design/05-thiet-ke-chuc-nang.md](../../docs/design/05-thiet-ke-chuc-nang.md)
- [docs/design/06-thiet-ke-co-so-du-lieu.md](../../docs/design/06-thiet-ke-co-so-du-lieu.md)
- [docs/design/07-thiet-ke-api.md](../../docs/design/07-thiet-ke-api.md)
- [docs/design/10-hieu-nang-mo-rong.md](../../docs/design/10-hieu-nang-mo-rong.md)

Tập trung vào: mục 5.7 (bảng widget), 5.8, 6.4 Chỉ mục, 7.3.3 (dashboard, reports), 10.1.

## Nhiệm vụ

Tạo api/src/modules/analytics với repository dùng Prisma $queryRaw (tham số hóa bằng tagged template, KHÔNG nối chuỗi) cho các truy vấn tổng hợp:
- GET /dashboard/summary?month=YYYY-MM: greeting data, totals {income, expense, net, vsPrevMonthPct}, topCategory, budgetVsActual[], categoryBreakdown[], trend6Months[], savingsGoalProgress, latestInsight (tóm tắt), recentActivity[], activeAnnouncements[]. Tips để trống (Giai đoạn 12 bổ sung).
- GET /reports/category-breakdown?from&to&type&categoryId: tổng, tỷ trọng %, số giao dịch, so sánh kỳ trước cùng độ dài.
- GET /reports/income-vs-expense?months=6: thu, chi, tiết kiệm ròng từng tháng (tháng không có dữ liệu vẫn trả 0).
- GET /reports/daily-weekly?month=: theo ngày và theo tuần ISO, kèm trung bình ngày.
Yêu cầu: ranh giới tháng tính theo timezone người dùng; loại giao dịch deleted_at; số tiền trả dạng chuỗi; mỗi truy vấn ghi chú chỉ mục nào nó dùng. Dùng EXPLAIN để kiểm tra và dán kết quả EXPLAIN của 2 truy vấn nặng nhất vào phần giải thích.
Test với dữ liệu mẫu: tổng theo tháng đúng khi có giao dịch ngày 31 lúc 23:30 giờ Việt Nam.

## Kết thúc

In: (1) giả định đã đặt, (2) chỗ đội cần tự kiểm tra, (3) lệnh để chạy/kiểm thử, (4) một dòng đề xuất cho docs/ai-usage-log.md.

---
name: p13-1-system-intelligence
description: "🔵 P13.1 – Phát hiện bất thường, trùng lặp, dự báo, hoạt động gần đây"
agent: agent
---
# P13.1 – Phát hiện bất thường, trùng lặp, dự báo, hoạt động gần đây

> **Cấp AI: 🔵 Tầm trung agentic** – Các thuật toán đã có công thức trong tài liệu; cần hiện thực trong handler sự kiện và API, kèm test thống kê.

Tuân thủ toàn bộ quy tắc trong AGENTS.md (đã được nạp tự động).

## Tài liệu tham chiếu (đọc trước khi làm)

- [docs/design/05-thiet-ke-chuc-nang.md](../../docs/design/05-thiet-ke-chuc-nang.md)
- [docs/design/07-thiet-ke-api.md](../../docs/design/07-thiet-ke-api.md)

Tập trung vào: mục 5.14 (bảng tính năng), 7.3.2 (resolve-flag), 7.3.3 (/forecast, /activity).

## Nhiệm vụ

1. api/src/events/handlers/anomaly.ts (khi transaction.created/updated):
   - Bất thường: danh mục có ≥ 5 giao dịch trong 90 ngày; amount > mean + 3σ HOẶC > 3 × median, VÀ > 20% trợ cấp cơ sở → is_anomaly = true + notification "Unusually large expense – is this correct?".
   - Trùng lặp: cùng user, cùng amount và type, cùng danh mục hoặc merchant_key Levenshtein ≤ 2, ngày chênh ≤ 1, tạo cách nhau ≤ 10 phút, không phải recurring → is_possible_duplicate = true + notification.
2. POST /transactions/:id/resolve-flag {flag: anomaly|duplicate, action: keep|delete}.
3. GET /forecast/next-month: mỗi danh mục = 0,5·M−1 + 0,3·M−2 + 0,2·M−3 cộng khoản định kỳ đã biết; khoảng ±1σ; < 2 tháng dữ liệu → {insufficientData: true}.
4. GET /activity/recent (20 bản ghi, đồng bộ đa thiết bị vì lưu server).
5. Frontend: badge cảnh báo trên dòng giao dịch bị gắn cờ kèm nút "Keep" / "Delete duplicate"; tab Dự báo trong trang Báo cáo (đường + vùng sai số); widget "Gần đây" trên dashboard.
Hàm thống kê (mean, stddev, median, levenshtein, weightedForecast) tách ra api/src/lib/stats.ts và có unit test.

## Kết thúc

In: (1) giả định đã đặt, (2) chỗ đội cần tự kiểm tra, (3) lệnh để chạy/kiểm thử, (4) một dòng đề xuất cho docs/ai-usage-log.md.

---
description: "🔵 P8.2 – Frontend dashboard và báo cáo"
model: sonnet
---
# P8.2 – Frontend dashboard và báo cáo

> **Cấp AI: 🔵 Tầm trung agentic** – Nhiều widget và biểu đồ, lazy-load Chart.js, dark mode cho biểu đồ.

Tuân thủ toàn bộ quy tắc trong AGENTS.md (đã được nạp tự động).

## Tài liệu tham chiếu (đọc trước khi làm)

- @docs/design/05-thiet-ke-chuc-nang.md
- @docs/design/08-thiet-ke-giao-dien.md

Tập trung vào: mục 5.7, 5.8, 8.2 Design tokens, 8.3, 8.4 Responsive.

## Nhiệm vụ

1. src/components/charts: ChartCard, DoughnutChart, GroupedBarChart, LineChart – bọc react-chartjs-2, lazy-load Chart.js (React.lazy), bảng màu lấy từ CSS variables để tự đổi theo dark mode, có bảng dữ liệu thay thế ẩn cho trình đọc màn hình (aria).
2. Trang Dashboard theo bảng widget mục 5.7: lưới Bootstrap responsive (1 cột mobile, 2 cột tablet, 3 cột desktop); skeleton riêng từng widget; Error Boundary từng widget.
3. Trang Báo cáo có 4 tab: Theo danh mục, Thu vs Chi 6 tháng, Ngày/Tuần tháng này, Dự báo (để placeholder, làm ở Giai đoạn 13). Bộ lọc dùng chung đồng bộ URL query. Nút "Export PNG" dùng html-to-image chụp vùng báo cáo.
4. Breadcrumbs sinh tự động từ cấu hình route (handle.crumb của React Router).

## Kết thúc

In: (1) giả định đã đặt, (2) chỗ đội cần tự kiểm tra, (3) lệnh để chạy/kiểm thử, (4) một dòng đề xuất cho docs/ai-usage-log.md.

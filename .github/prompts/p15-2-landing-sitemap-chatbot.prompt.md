---
name: p15-2-landing-sitemap-chatbot
description: "🟢 P15.2 – Trang chủ công khai, sitemap, chatbot Tawk.to"
agent: agent
---
# P15.2 – Trang chủ công khai, sitemap, chatbot Tawk.to

> **Cấp AI: 🟢 Rẻ/nhanh** – Trang tĩnh và nhúng script theo hướng dẫn.

Tuân thủ toàn bộ quy tắc trong AGENTS.md (đã được nạp tự động).

## Tài liệu tham chiếu (đọc trước khi làm)

- [docs/design/01-gioi-thieu.md](../../docs/design/01-gioi-thieu.md)
- [docs/design/03-lua-chon-cong-nghe.md](../../docs/design/03-lua-chon-cong-nghe.md)
- [docs/design/08-thiet-ke-giao-dien.md](../../docs/design/08-thiet-ke-giao-dien.md)
- [docs/srs/campus-coin-srs.md](../../docs/srs/campus-coin-srs.md)

Tập trung vào: mục 8.1 Sitemap, 3.4 (Tawk.to), SRS mục 1.9 (sitemap bắt buộc ở trang chủ).

## Nhiệm vụ

- Landing page: hero giới thiệu Campus Coin (tagline "Smart Spending, Student Style"), 6 tính năng chính, ảnh chụp màn hình (placeholder), CTA Đăng ký/Đăng nhập, footer có link Sitemap (BẮT BUỘC theo SRS) và link Giới thiệu/Điều khoản/Quyền riêng tư.
- Trang /sitemap: sinh từ cấu hình route (không viết tay), nhóm Công khai / Sinh viên / Quản trị, mỗi mục có mô tả một dòng.
- Nhúng Tawk.to: component TawkWidget chỉ tải script sau khi trang đã render, ID lấy từ VITE_TAWK_PROPERTY_ID / VITE_TAWK_WIDGET_ID; không tải trong khu admin. Soạn sẵn 10 câu FAQ bằng tiếng Anh cho Tawk.to shortcuts (cách thêm giao dịch, nhập CSV, đặt ngân sách, AI dùng dữ liệu gì...).
- Toàn bộ nội dung trang bằng tiếng Anh; viết copy marketing ngắn gọn, giọng thân thiện với sinh viên.
- Onboarding 3 bước cho người dùng mới (nhập trợ cấp cơ sở, mục tiêu tiết kiệm, ghi giao dịch đầu tiên).

## Kết thúc

In: (1) giả định đã đặt, (2) chỗ đội cần tự kiểm tra, (3) lệnh để chạy/kiểm thử, (4) một dòng đề xuất cho docs/ai-usage-log.md.

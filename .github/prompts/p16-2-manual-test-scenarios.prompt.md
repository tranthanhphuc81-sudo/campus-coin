---
name: p16-2-manual-test-scenarios
description: "🟢 P16.2 – Kịch bản kiểm thử luồng thủ công"
agent: agent
---
# P16.2 – Kịch bản kiểm thử luồng thủ công

> **Cấp AI: 🟢 Rẻ/nhanh** – Viết tài liệu kịch bản từ danh sách chức năng.

Tuân thủ toàn bộ quy tắc trong AGENTS.md (đã được nạp tự động).

## Tài liệu tham chiếu (đọc trước khi làm)

- [docs/design/11-trien-khai-van-hanh.md](../../docs/design/11-trien-khai-van-hanh.md)
- [docs/design/phu-luc-a-truy-vet-chuc-nang.md](../../docs/design/phu-luc-a-truy-vet-chuc-nang.md)

Tập trung vào: Phụ lục A – Ma trận truy vết yêu cầu chức năng, mục 11.5 Tài khoản demo.

## Nhiệm vụ

Viết docs/manual-test-scenarios.md: 15 kịch bản kiểm thử luồng (mỗi kịch bản: mã, mục tiêu, tài khoản dùng, các bước, kết quả mong đợi, cột Đạt/Không đạt, người kiểm, ngày). Phủ đủ mọi yêu cầu chức năng SRS: đăng ký/xác minh/đăng nhập/quên mật khẩu, admin login riêng, hồ sơ, danh mục, thêm nhanh, định kỳ, sửa/xóa/khôi phục có lịch sử, nhập CSV có gợi ý AI, dashboard, 3 loại báo cáo + lọc + xuất PDF/PNG + email, nhận định AI, mẹo pin/dismiss, ngân sách + cảnh báo, bookmark, quản trị, bất thường/trùng lặp/dự báo, dark mode/cỡ chữ/breadcrumbs, sitemap, chatbot. Ghi rõ kiểm tra trên Chrome, Firefox, Edge và điện thoại.

## Kết thúc

In: (1) giả định đã đặt, (2) chỗ đội cần tự kiểm tra, (3) lệnh để chạy/kiểm thử, (4) một dòng đề xuất cho docs/ai-usage-log.md.

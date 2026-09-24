---
name: p14-1-bookmarks
description: "🟢 P14.1 – Bookmark và ghi chú"
agent: agent
---
# P14.1 – Bookmark và ghi chú

> **Cấp AI: 🟢 Rẻ/nhanh** – CRUD đơn giản.

Tuân thủ toàn bộ quy tắc trong AGENTS.md (đã được nạp tự động).

## Tài liệu tham chiếu (đọc trước khi làm)

- [docs/design/05-thiet-ke-chuc-nang.md](../../docs/design/05-thiet-ke-chuc-nang.md)
- [docs/design/06-thiet-ke-co-so-du-lieu.md](../../docs/design/06-thiet-ke-co-so-du-lieu.md)

Tập trung vào: mục 5.12, 6.3.7 (bookmarks).

## Nhiệm vụ

Backend GET/POST/PATCH/DELETE /bookmarks (targetType: tip | insight | report; targetRef: id tip, tháng nhận định, hoặc chuỗi query bộ lọc báo cáo; note ≤ 500 ký tự; UNIQUE(user, type, ref) → 409).
Frontend: nút Bookmark dùng chung (BookmarkButton) đặt trên thẻ mẹo, trang nhận định, trang báo cáo (lưu bộ lọc hiện tại); trang "Saved" có tab theo loại và ô tìm theo ghi chú; mở bookmark báo cáo sẽ khôi phục đúng bộ lọc.

## Kết thúc

In: (1) giả định đã đặt, (2) chỗ đội cần tự kiểm tra, (3) lệnh để chạy/kiểm thử, (4) một dòng đề xuất cho docs/ai-usage-log.md.

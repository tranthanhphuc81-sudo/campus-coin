---
name: p2-1a-db-schema-decide
description: "🔴 P2.1-A – Chốt thiết kế Prisma schema cho MySQL"
agent: agent
---
# P2.1-A – Chốt thiết kế Prisma schema cho MySQL

> **Cấp AI: 🔴 Cao cấp/suy luận** – Sai schema thì sửa rất đắt về sau. Có nhiều điểm Prisma không biểu diễn được (CHECK, cột sinh, UUID v7) cần quyết định có chủ đích.

Tuân thủ toàn bộ quy tắc trong AGENTS.md (đã được nạp tự động).

## Tài liệu tham chiếu (đọc trước khi làm)

- [docs/design/06-thiet-ke-co-so-du-lieu.md](../../docs/design/06-thiet-ke-co-so-du-lieu.md)
- [docs/design/07-thiet-ke-api.md](../../docs/design/07-thiet-ke-api.md)

Tập trung vào: toàn bộ chương 6 – Thiết kế cơ sở dữ liệu.

## Nhiệm vụ

KHÔNG VIẾT CODE. Hãy đóng vai kiến trúc sư dữ liệu và ra quyết định cho các vấn đề sau, mỗi vấn đề nêu 2–3 phương án, ưu/nhược điểm, và CHỐT một phương án kèm lý do:

1. UUID v7 dạng CHAR(36): sinh ở ứng dụng (thư viện nào) hay DB? Ảnh hưởng tới Prisma @default.
2. Bảng categories cần UNIQUE(owner_key, name, type) với owner_key = COALESCE(user_id,'SYSTEM') là cột sinh. Prisma không hỗ trợ cột sinh. Phương án: (a) cột sinh + unique index viết tay trong migration SQL, khai báo trong Prisma thế nào để migrate không cố xóa nó; (b) bỏ cột sinh, kiểm tra trùng ở service; (c) phương án khác.
3. CHECK constraint (amount > 0, alert_threshold_pct 50–100, interval_count 1–12, ...): liệt kê ĐẦY ĐỦ các CHECK cần viết tay trong migration theo từ điển dữ liệu.
4. Kiểu Decimal của Prisma: cách chuyển sang chuỗi "12.50" ở tầng API một cách nhất quán (serializer chung hay từng DTO).
5. Idempotency-Key (mục 7.1 lưu 24 giờ) chưa có bảng trong từ điển dữ liệu: thiết kế bảng idempotency_keys (cột, khóa, TTL, cách dọn).
6. Xóa mềm (deleted_at) với Prisma: dùng Prisma Client extension để tự lọc hay lọc thủ công ở repository? Rủi ro quên lọc.
7. Múi giờ: txn_date là DATE theo giờ địa phương người dùng; ranh giới tháng tính theo timezone trong users. Chốt cách tính "tháng hiện tại" ở backend.
8. Prisma relation mode và onDelete cho từng khóa ngoại theo từ điển dữ liệu (CASCADE / RESTRICT / SET NULL).

Kết quả trả về dạng một tài liệu ADR (Markdown) có tiêu đề "ADR-DB-01: Thiết kế schema Prisma cho MySQL", mỗi quyết định một mục, kết thúc bằng checklist những gì migration SQL phải viết tay.

## Cách ghi kết quả

Chỉ tạo hoặc cập nhật DUY NHẤT file `docs/decisions/ADR-DB-01.md` theo mẫu `docs/decisions/ADR-TEMPLATE.md`, trạng thái `Proposed`. KHÔNG tạo hay sửa file code nào. Đội sẽ đọc, chỉnh và đổi trạng thái sang `Accepted` trước khi chạy bước B.

## Kết thúc

In: (1) giả định đã đặt, (2) chỗ đội cần tự kiểm tra, (3) lệnh để chạy/kiểm thử, (4) một dòng đề xuất cho docs/ai-usage-log.md.

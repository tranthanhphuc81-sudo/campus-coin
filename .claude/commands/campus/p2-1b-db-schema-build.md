---
description: "🔵 P2.1-B – Viết Prisma schema và migration"
model: sonnet
---
# P2.1-B – Viết Prisma schema và migration

> **Cấp AI: 🔵 Tầm trung agentic** – Nhiều model, nhiều file (schema, migration SQL chỉnh tay, extension), cần bám sát ADR.

Tuân thủ toàn bộ quy tắc trong AGENTS.md (đã được nạp tự động).

## Tài liệu tham chiếu (đọc trước khi làm)

- @docs/design/06-thiet-ke-co-so-du-lieu.md
- @docs/decisions/ADR-DB-01.md

Tập trung vào: chương 6 + kết quả ADR-DB-01 từ bước A.

**Điều kiện tiên quyết:** các file `docs/decisions/ADR-DB-01.md` phải tồn tại và có trạng thái `Accepted`. Nếu chưa, DỪNG và nhắc người dùng chạy prompt bước A tương ứng.

## Nhiệm vụ

Hiện thực đúng ADR-DB-01:
1. api/prisma/schema.prisma: đầy đủ các bảng users, refresh_tokens, auth_tokens, categories, transactions, transaction_history, recurring_rules, budgets, insights, tip_templates, user_tips, notifications, bookmarks, ai_category_rules, import_batches, import_rows (nếu ADR có), recent_activity, announcements, audit_logs, idempotency_keys. Dùng @map/@@map để tên bảng/cột snake_case trong DB, camelCase trong code. Khai báo đủ index theo mục 6.4.
2. Tạo migration đầu bằng: prisma migrate dev --create-only --name init. Sau đó CHỈNH TAY file migration.sql để thêm: toàn bộ CHECK constraint, cột sinh owner_key + unique index (nếu ADR chọn), và mọi thứ ADR liệt kê.
3. api/src/lib/prisma.ts: PrismaClient singleton + extension theo ADR (xóa mềm, serialize Decimal).
4. api/src/lib/ids.ts: hàm newId() sinh UUID v7.
5. Script npm: db:migrate, db:reset, db:studio, db:export-schema (dùng mysqldump --no-data xuất ra /database/campus_coin_schema.sql).
Sau khi xong: liệt kê từng CHECK đã thêm và câu SQL để tôi tự kiểm tra (SHOW CREATE TABLE ...).

## Kết thúc

In: (1) giả định đã đặt, (2) chỗ đội cần tự kiểm tra, (3) lệnh để chạy/kiểm thử, (4) một dòng đề xuất cho docs/ai-usage-log.md.

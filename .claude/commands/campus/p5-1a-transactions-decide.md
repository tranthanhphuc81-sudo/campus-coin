---
description: "🔴 P5.1-A – Chốt thiết kế ghi giao dịch, lịch sử và sự kiện"
model: opus
allowed-tools: Read, Grep, Glob
---
# P5.1-A – Chốt thiết kế ghi giao dịch, lịch sử và sự kiện

> **Cấp AI: 🔴 Cao cấp/suy luận** – Liên quan tính toàn vẹn dữ liệu: khóa lạc quan, lịch sử append-only, idempotency, thứ tự phát sự kiện sau commit.

Tuân thủ toàn bộ quy tắc trong AGENTS.md (đã được nạp tự động).

## Tài liệu tham chiếu (đọc trước khi làm)

- @docs/design/04-kien-truc-he-thong.md
- @docs/design/05-thiet-ke-chuc-nang.md
- @docs/design/06-thiet-ke-co-so-du-lieu.md
- @docs/design/07-thiet-ke-api.md
- @docs/decisions/ADR-DB-01.md

Tập trung vào: mục 4.6, 5.4, 6.3.4, 7.1 (Idempotency, version), ADR-DB-01.

**Điều kiện tiên quyết:** các file `docs/decisions/ADR-DB-01.md` phải tồn tại và có trạng thái `Accepted`. Nếu chưa, DỪNG và nhắc người dùng chạy prompt bước A tương ứng.

## Nhiệm vụ

KHÔNG VIẾT CODE. Chốt thiết kế cho:
1. Luồng tạo/sửa/xóa mềm/khôi phục giao dịch: các bước trong MỘT DB transaction (ghi transactions + transaction_history), và thời điểm phát sự kiện nội bộ (chỉ SAU commit). Nếu handler lỗi thì sao?
2. Khóa lạc quan với cột version: câu UPDATE cụ thể (WHERE id AND user_id AND version), cách trả 409 version-mismatch kèm bản mới nhất.
3. Nội dung snapshot và changed_fields trong transaction_history (định dạng JSON).
4. Idempotency-Key cho POST /transactions: lưu gì, trả gì khi gửi lặp (cùng key, khác body → 422).
5. Chuẩn hóa merchant_key (quy tắc mục 5.6) – đặt ở đâu để dùng chung cho AI, trùng lặp, CSV.
6. Event bus nội bộ: interface TypedEventEmitter, danh sách sự kiện (transaction.created | updated | deleted | restored) và payload; handler chạy tuần tự hay song song; cách bảo đảm lỗi handler không làm hỏng response.
7. Bộ lọc danh sách (mục 5.4 BR-TX-08): cách dựng where của Prisma an toàn; tìm theo từ khóa mô tả dùng LIKE hay FULLTEXT (với quy mô A-02).
Trả về ADR-TX-01 dạng Markdown.

## Cách ghi kết quả

Chỉ tạo hoặc cập nhật DUY NHẤT file `docs/decisions/ADR-TX-01.md` theo mẫu `docs/decisions/ADR-TEMPLATE.md`, trạng thái `Proposed`. KHÔNG tạo hay sửa file code nào. Đội sẽ đọc, chỉnh và đổi trạng thái sang `Accepted` trước khi chạy bước B.

## Kết thúc

In: (1) giả định đã đặt, (2) chỗ đội cần tự kiểm tra, (3) lệnh để chạy/kiểm thử, (4) một dòng đề xuất cho docs/ai-usage-log.md.

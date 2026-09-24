---
name: p16-1-test-suite
description: "🔵 P16.1 – Bộ test theo test case tài liệu"
agent: agent
---
# P16.1 – Bộ test theo test case tài liệu

> **Cấp AI: 🔵 Tầm trung agentic** – Viết test tích hợp trải nhiều module, cần chạy được với MySQL thật.

Tuân thủ toàn bộ quy tắc trong AGENTS.md (đã được nạp tự động).

## Tài liệu tham chiếu (đọc trước khi làm)

- [docs/design/12-chien-luoc-kiem-thu.md](../../docs/design/12-chien-luoc-kiem-thu.md)

Tập trung vào: mục 12.1, 12.2 (test case TC-01 → TC-12), 12.3 Dữ liệu kiểm thử.

## Nhiệm vụ

1. Hạ tầng test api/tests: setup tạo DB test riêng (campus_coin_test), chạy migrate trước khi chạy suite, xóa dữ liệu giữa các test bằng TRUNCATE theo thứ tự khóa ngoại; factory tạo user/category/transaction; helper loginAs(role).
2. Viết test tích hợp cho TỪNG test case TC-01 → TC-12 trong mục 12.2, tên test ghi rõ mã TC.
3. Bổ sung bộ test "cross-tenant": với MỌI endpoint có :id của sinh viên (transactions, categories, budgets, recurring-rules, imports, bookmarks, tips, notifications), user B truy cập tài nguyên user A phải nhận 404.
4. Cấu hình vitest --coverage, xuất báo cáo html.
Cho tôi lệnh chạy và cách đọc báo cáo coverage.

## Kết thúc

In: (1) giả định đã đặt, (2) chỗ đội cần tự kiểm tra, (3) lệnh để chạy/kiểm thử, (4) một dòng đề xuất cho docs/ai-usage-log.md.

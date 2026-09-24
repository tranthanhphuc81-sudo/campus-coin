---
description: "🔵 P10.1 – Nhập CSV ba bước (backend + frontend)"
model: sonnet
---
# P10.1 – Nhập CSV ba bước (backend + frontend)

> **Cấp AI: 🔵 Tầm trung agentic** – Nhiều ca biên (định dạng ngày, dấu thập phân, BOM, trùng lặp) và luồng 3 bước FE/BE; cần test kỹ.

Tuân thủ toàn bộ quy tắc trong AGENTS.md (đã được nạp tự động).

## Tài liệu tham chiếu (đọc trước khi làm)

- @docs/design/05-thiet-ke-chuc-nang.md
- @docs/design/06-thiet-ke-co-so-du-lieu.md
- @docs/design/07-thiet-ke-api.md
- @docs/design/09-bao-mat.md

Tập trung vào: mục 5.5 (bảng định dạng CSV), 9.10 An toàn file, 6.3.7 (import_batches), 7.3.2 (/imports), Hình 15.

## Nhiệm vụ

Backend api/src/modules/imports (xử lý đồng bộ trong request, không dùng hàng đợi):
- GET /imports/template: file CSV mẫu (date,amount,type,description,category) có 3 dòng ví dụ.
- POST /imports (multer memoryStorage, giới hạn 2 MB, chỉ .csv, kiểm tra MIME và nội dung): tính SHA-256 file → trùng UNIQUE(user_id, file_sha256) trả 409; loại BOM; tự nhận dấu phân tách , hoặc ;; parse bằng csv-parse; ≤ 5.000 dòng; validate từng dòng; nhận dạng ngày theo định dạng người dùng chọn (YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY); số tiền chấp nhận "." hoặc ","; type suy từ dấu âm nếu thiếu; khớp tên danh mục, nếu trống thì phân loại hàng loạt (theo lô 50 mô tả qua categorizer); đánh dấu dòng trùng giao dịch đã có (cùng ngày, số tiền, merchant_key) và mặc định bỏ chọn. Không lưu file gốc. Trả 200 {batchId, preview, errors}.
- GET /imports/:id, PATCH /imports/:id/rows (sửa danh mục, bỏ chọn dòng), POST /imports/:id/commit (Idempotency-Key; MỘT DB transaction; source='csv_import'; ghi history; phát sự kiện), DELETE /imports/:id.
- Chống CSV injection khi xuất báo cáo lỗi: tiền tố ' cho ô bắt đầu bằng = + - @.
Frontend: trang Nhập CSV 3 bước (Tải lên → Xem trước & chỉnh → Kết quả), bảng xem trước có tô màu dòng lỗi/dòng trùng, chọn định dạng ngày, sửa danh mục từng dòng, nút tải báo cáo lỗi.
Test: file có BOM; file dùng ";" và số "4,50"; dòng thiếu amount báo lỗi đúng số dòng; commit 2 lần cùng Idempotency-Key chỉ nhập 1 lần; file 3 MB → 413.

## Kết thúc

In: (1) giả định đã đặt, (2) chỗ đội cần tự kiểm tra, (3) lệnh để chạy/kiểm thử, (4) một dòng đề xuất cho docs/ai-usage-log.md.

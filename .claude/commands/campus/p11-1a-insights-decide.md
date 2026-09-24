---
description: "🔴 P11.1-A – Chốt thuật toán thống kê và kiểm soát đầu ra LLM"
model: opus
allowed-tools: Read, Grep, Glob
---
# P11.1-A – Chốt thuật toán thống kê và kiểm soát đầu ra LLM

> **Cấp AI: 🔴 Cao cấp/suy luận** – Thuật toán thống kê và bộ kiểm tra "chống bịa số" quyết định độ tin cậy của tính năng; cần suy luận cẩn thận về ca biên.

Tuân thủ toàn bộ quy tắc trong AGENTS.md (đã được nạp tự động).

## Tài liệu tham chiếu (đọc trước khi làm)

- @docs/design/05-thiet-ke-chuc-nang.md
- @docs/design/06-thiet-ke-co-so-du-lieu.md

Tập trung vào: mục 5.9.1, 5.9.2, 6.3.6 (insights), Hình 18, Hình 19.

## Nhiệm vụ

KHÔNG VIẾT CODE. Chốt:
1. Đặc tả hàm computeMonthStats(userId, month): input, output JSON (dùng làm stats_snapshot), công thức cur, avg3 (bỏ tháng trống, cần ≥ 2 tháng), g, điều kiện flag (g ≥ 25% VÀ chênh lệch tuyệt đối ≥ max(5 đơn vị tiền, 5% trợ cấp cơ sở)), tỷ lệ tiết kiệm, danh mục mới, giao dịch bất thường lớn nhất, top 3 mẫu. Xử lý: trợ cấp cơ sở null, thu = 0, tiền VND.
2. Lời khuyên hành động: hạn mức tuần = avg3 / 4,33 làm tròn theo tiền tệ; bảng gợi ý thay thế theo danh mục.
3. Prompt LLM nguyên văn (system + user), JSON schema {summary_text, tip_text}, temperature 0,3, ≤ 120 từ, luôn bằng tiếng Anh.
4. Bộ kiểm tra đầu ra: parse schema; độ dài; trích mọi con số trong văn bản (cả dạng "40%", "12,50", "12.5 USD") và so khớp với tập số liệu cho phép (sai số làm tròn bao nhiêu); lọc từ khóa cấm (vay, đầu tư, crypto...). Không đạt → template.
5. Template dự phòng bằng tiếng Anh cho các trường hợp: có mẫu tăng, không có mẫu nào, tiết kiệm tốt.
6. Trạng thái job (queued → processing → completed/failed), retry 3 lần (2s, 8s, 32s) chỉ khi lỗi mạng/429/timeout; regenerate tối đa 3 lần/tháng.
Trả về ADR-INSIGHT-01 kèm 3 bộ dữ liệu ví dụ (input stats → output mong đợi) để làm test.

## Cách ghi kết quả

Chỉ tạo hoặc cập nhật DUY NHẤT file `docs/decisions/ADR-INSIGHT-01.md` theo mẫu `docs/decisions/ADR-TEMPLATE.md`, trạng thái `Proposed`. KHÔNG tạo hay sửa file code nào. Đội sẽ đọc, chỉnh và đổi trạng thái sang `Accepted` trước khi chạy bước B.

## Kết thúc

In: (1) giả định đã đặt, (2) chỗ đội cần tự kiểm tra, (3) lệnh để chạy/kiểm thử, (4) một dòng đề xuất cho docs/ai-usage-log.md.

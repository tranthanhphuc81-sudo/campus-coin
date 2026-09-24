---
name: p8-3a-pdf-decide
description: "🔴 P8.3-A – Chốt cách sinh PDF có biểu đồ"
agent: agent
---
# P8.3-A – Chốt cách sinh PDF có biểu đồ

> **Cấp AI: 🔴 Cao cấp/suy luận** – Chọn sai (vd. thư viện cần canvas native) sẽ vỡ build Docker alpine và tốn thời gian gỡ lỗi.

Tuân thủ toàn bộ quy tắc trong AGENTS.md (đã được nạp tự động).

## Tài liệu tham chiếu (đọc trước khi làm)

- [docs/design/05-thiet-ke-chuc-nang.md](../../docs/design/05-thiet-ke-chuc-nang.md)
- [docs/design/09-bao-mat.md](../../docs/design/09-bao-mat.md)

Tập trung vào: mục 5.8, ADR-09 (pdfmake), mục 9.10.

## Nhiệm vụ

KHÔNG VIẾT CODE. Báo cáo PDF tháng cần: trang bìa, bảng tổng hợp, biểu đồ (doughnut theo danh mục, cột 6 tháng), top giao dịch, nhận định tháng, ghi chú "Not financial advice"; toàn bộ nội dung PDF bằng tiếng Anh nhưng font phải hiển thị đúng tên/mô tả có dấu tiếng Việt do người dùng nhập.
So sánh 3 cách đưa biểu đồ vào PDF phía server với pdfmake:
(a) chartjs-node-canvas (cần thư viện native canvas) – ảnh hưởng image node:24-alpine;
(b) tự sinh SVG đơn giản (doughnut, cột) bằng hàm TypeScript thuần rồi nhúng vào pdfmake (pdfmake hỗ trợ SVG);
(c) client gửi ảnh PNG biểu đồ lên khi xuất.
Đánh giá theo: độ phức tạp, dung lượng image Docker, bảo mật (SRS: không tải file độc hại), độ nhất quán giao diện, thời gian làm trong cuộc thi. Chốt một phương án. Chỉ rõ cách nhúng font Roboto/Noto Sans (có glyph tiếng Việt cho dữ liệu người dùng) vào pdfmake.
Trả về ADR-PDF-01.

## Cách ghi kết quả

Chỉ tạo hoặc cập nhật DUY NHẤT file `docs/decisions/ADR-PDF-01.md` theo mẫu `docs/decisions/ADR-TEMPLATE.md`, trạng thái `Proposed`. KHÔNG tạo hay sửa file code nào. Đội sẽ đọc, chỉnh và đổi trạng thái sang `Accepted` trước khi chạy bước B.

## Kết thúc

In: (1) giả định đã đặt, (2) chỗ đội cần tự kiểm tra, (3) lệnh để chạy/kiểm thử, (4) một dòng đề xuất cho docs/ai-usage-log.md.

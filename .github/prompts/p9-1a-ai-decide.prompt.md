---
name: p9-1a-ai-decide
description: "🔴 P9.1-A – Chốt thiết kế AI Adapter và phân loại ba tầng"
agent: agent
---
# P9.1-A – Chốt thiết kế AI Adapter và phân loại ba tầng

> **Cấp AI: 🔴 Cao cấp/suy luận** – Liên quan quyền riêng tư (dữ liệu gửi ra ngoài), chi phí, prompt injection và độ tin cậy; đây cũng là điểm giám khảo hỏi nhiều nhất.

Tuân thủ toàn bộ quy tắc trong AGENTS.md (đã được nạp tự động).

## Tài liệu tham chiếu (đọc trước khi làm)

- [docs/design/03-lua-chon-cong-nghe.md](../../docs/design/03-lua-chon-cong-nghe.md)
- [docs/design/05-thiet-ke-chuc-nang.md](../../docs/design/05-thiet-ke-chuc-nang.md)
- [docs/design/06-thiet-ke-co-so-du-lieu.md](../../docs/design/06-thiet-ke-co-so-du-lieu.md)
- [docs/design/07-thiet-ke-api.md](../../docs/design/07-thiet-ke-api.md)
- [docs/design/09-bao-mat.md](../../docs/design/09-bao-mat.md)

Tập trung vào: mục 3.4, 5.6, 9.9 An toàn khi dùng AI, 6.3.7 (ai_category_rules), 7.4.

## Nhiệm vụ

KHÔNG VIẾT CODE. Chốt thiết kế:
1. Interface AiProvider chung (categorize, generateInsight) để đổi Gemini ↔ OpenAI ↔ none; cách bật structured output JSON theo schema của từng nhà cung cấp.
2. Thuật toán chuẩn hóa merchant_key (chữ thường, bỏ dấu – kể cả dấu tiếng Việt nếu người dùng gõ, bỏ số, ký tự đặc biệt, từ dừng) – liệt kê từ dừng tiếng Anh (at, the, from, for, to, ...).
3. Tầng 1 (luật cá nhân): cách tính confidence (0,95 khi hit_count ≥ 2, 0,8 khi = 1); quy tắc "luật mới thay luật cũ nếu bị sửa 2 lần liên tiếp" – cần thêm cột gì?
4. Tầng 2 (từ khóa): khớp theo token hay substring; xử lý xung đột nhiều từ khóa.
5. Tầng 3 (LLM): prompt system/user với ranh giới rõ ràng chống prompt injection từ mô tả người dùng; làm sạch PII (regex email, SĐT Việt Nam, số tài khoản/thẻ); chỉ gửi mô tả đã làm sạch + danh sách tên danh mục; loại kết quả không thuộc danh sách; giới hạn confidence ≤ 0,9; timeout 3 giây.
6. Cache LRU trong bộ nhớ: key, kích thước tối đa, TTL 7 ngày; quota 200 lời gọi LLM/người dùng/ngày – đếm ở đâu khi không có Redis (bảng DB hay bộ nhớ? Chấp nhận mất đếm khi restart không?).
7. Chỉ gọi LLM khi user.aiOptIn = true; lỗi/timeout trả gợi ý rỗng, không chặn lưu giao dịch.
8. Cách đo độ chính xác: tỷ lệ ai_accepted / (ai_accepted + ai_overridden) cho admin.
Viết sẵn NGUYÊN VĂN prompt tầng 3 (system + user template) và JSON schema đầu ra. Trả về ADR-AI-01.

## Cách ghi kết quả

Chỉ tạo hoặc cập nhật DUY NHẤT file `docs/decisions/ADR-AI-01.md` theo mẫu `docs/decisions/ADR-TEMPLATE.md`, trạng thái `Proposed`. KHÔNG tạo hay sửa file code nào. Đội sẽ đọc, chỉnh và đổi trạng thái sang `Accepted` trước khi chạy bước B.

## Kết thúc

In: (1) giả định đã đặt, (2) chỗ đội cần tự kiểm tra, (3) lệnh để chạy/kiểm thử, (4) một dòng đề xuất cho docs/ai-usage-log.md.

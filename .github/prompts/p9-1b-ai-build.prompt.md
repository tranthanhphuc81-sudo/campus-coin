---
name: p9-1b-ai-build
description: "🔵 P9.1-B – Hiện thực phân loại AI backend"
agent: agent
---
# P9.1-B – Hiện thực phân loại AI backend

> **Cấp AI: 🔵 Tầm trung agentic** – Module nhiều lớp (adapter, 3 tầng, cache, quota, feedback, handler học).

Tuân thủ toàn bộ quy tắc trong AGENTS.md (đã được nạp tự động).

## Tài liệu tham chiếu (đọc trước khi làm)

- [docs/design/05-thiet-ke-chuc-nang.md](../../docs/design/05-thiet-ke-chuc-nang.md)
- [docs/design/07-thiet-ke-api.md](../../docs/design/07-thiet-ke-api.md)
- [docs/decisions/ADR-AI-01.md](../../docs/decisions/ADR-AI-01.md)

Tập trung vào: ADR-AI-01, mục 5.6, 7.3.2 (/ai/*).

**Điều kiện tiên quyết:** các file `docs/decisions/ADR-AI-01.md` phải tồn tại và có trạng thái `Accepted`. Nếu chưa, DỪNG và nhắc người dùng chạy prompt bước A tương ứng.

## Nhiệm vụ

Hiện thực đúng ADR-AI-01:
- api/src/integrations/ai/{provider.ts, gemini.ts, openai.ts, none.ts, index.ts}: chọn provider theo AI_PROVIDER.
- api/src/modules/ai/{normalize.ts, keywords.ts, categorizer.service.ts, routes.ts}: POST /ai/categorize/suggest {description, amount, type} → {categoryId, categoryName, confidence, source: user_rule|keyword|llm} hoặc {suggestion: null}; POST /ai/feedback {description, suggestedCategoryId, chosenCategoryId}.
- api/src/events/handlers/aiLearning.ts: khi giao dịch có category_source user/ai_overridden → upsert ai_category_rules.
- Rate limit 60 lần/phút/người dùng.
Unit test: normalize("Campus Café #12") = "campus cafe"; tầng 1 thắng tầng 2; LLM trả danh mục không hợp lệ → bị loại; aiOptIn=false không bao giờ gọi provider (mock); PII bị xóa trước khi gửi.

## Kết thúc

In: (1) giả định đã đặt, (2) chỗ đội cần tự kiểm tra, (3) lệnh để chạy/kiểm thử, (4) một dòng đề xuất cho docs/ai-usage-log.md.

---
name: p1-1-init-monorepo
description: "🔵 P1.1 – Khởi tạo monorepo"
agent: agent
---
# P1.1 – Khởi tạo monorepo

> **Cấp AI: 🔵 Tầm trung agentic** – Tạo nhiều file cấu hình liên quan nhau (workspaces, tsconfig, eslint, prettier) cần nhất quán.

Tuân thủ toàn bộ quy tắc trong AGENTS.md (đã được nạp tự động).

## Nhiệm vụ

package.json gốc đã có sẵn (chứa script "prompts:build") và các thư mục docs/, tools/, .github/, .claude/ đã tồn tại – GIỮ NGUYÊN chúng, chỉ bổ sung.
Khởi tạo monorepo npm workspaces với các package: api, web, packages/shared.
Yêu cầu:
- package.json gốc: workspaces, script chung: dev (chạy song song api + web), lint, typecheck, test, format.
- tsconfig.base.json strict (strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes: false), mỗi package kế thừa.
- ESLint flat config (typescript-eslint, eslint-plugin-react-hooks, eslint-plugin-security cho api), Prettier.
- packages/shared: build bằng tsc, export schema Zod và type; cả api và web import được qua "@campus-coin/shared".
- api: Express 5 + TypeScript, chạy dev bằng tsx watch; build ra dist.
- web: Vite + React 19 + TypeScript; alias "@/..." trỏ src.
- .gitignore, .editorconfig, .nvmrc (Node 24), .env.example ở gốc (để trống giá trị, có chú thích từng biến).
Liệt kê lệnh để tôi chạy kiểm tra sau khi tạo xong.

## Kết thúc

In: (1) giả định đã đặt, (2) chỗ đội cần tự kiểm tra, (3) lệnh để chạy/kiểm thử, (4) một dòng đề xuất cho docs/ai-usage-log.md.

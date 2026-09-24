# CLAUDE.md

@AGENTS.md

## Ghi chú riêng cho Claude Code

- Lệnh dự án nằm trong `.claude/commands/campus/` – gõ `/` trong khung chat để xem (vd. `/p2-1a-db-schema-decide`).
- Mỗi lệnh đã khai báo sẵn model theo cấp AI (haiku / sonnet / opus). Đổi ánh xạ ở `tools/prompt-kit/tiers.json` rồi chạy `npm run prompts:build`.
- Ưu tiên chế độ Plan khi làm prompt `-decide`; chuyển sang chỉnh sửa khi làm prompt `-build`.

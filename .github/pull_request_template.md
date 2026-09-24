## Tính năng / Giai đoạn

- Prompt đã dùng: `/p...` (cấp: 🟢/🔵/🔴, model: ...)
- ADR liên quan: `docs/decisions/ADR-...` (trạng thái Accepted)

## Thay đổi chính

-

## Checklist (Definition of Done – AGENTS.md mục 3)

- [ ] Validate Zod tại biên API
- [ ] Mọi truy vấn lọc theo userId; tài nguyên người khác trả 404
- [ ] Có test thành công + test bị từ chối; `npm test` xanh
- [ ] `npm run lint` và `npm run typecheck` xanh
- [ ] Chuỗi giao diện tiếng Anh nằm trong `web/src/content/en.ts`
- [ ] Đã chạy `/r1-review` và xử lý mục "Phải sửa"
- [ ] Đã chạy `/r2-explain-defense` cho phần phức tạp; người làm giải thích được
- [ ] Đã thêm dòng vào `docs/ai-usage-log.md`

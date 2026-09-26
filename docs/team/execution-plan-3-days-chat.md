# Kế Hoạch 3 Ngày (Copy-Paste Lên Nhóm Chat)

## Thành viên và nhánh phụ trách

- Phúc (trưởng nhóm, tích hợp): `feat/integration-shared`
- Tuân (Backend Jobs): `feat/be-recurring-jobs`
- Minh (Backend Recurring Rules API): `feat/be-recurring-rules-api`
- Nhật Anh (Frontend Transactions): `feat/web-transactions`

## Quyền sở hữu file (tránh xung đột)

- Phúc chỉ sửa các hotspot:
  - `api/prisma/schema.prisma`
  - `api/src/app.ts`
  - `packages/shared/src/index.ts`
  - `web/src/App.tsx`
  - `web/src/layouts/StudentLayout.tsx`
  - `web/src/content/en.ts`
- Tuân chỉ sửa:
  - `api/src/jobs/**`
  - `api/src/events/bus.ts`
- Minh chỉ sửa:
  - `api/src/modules/recurring-rules/**`
  - `api/tests/recurring-rules.test.ts`
- Nhật Anh chỉ sửa:
  - `web/src/features/transactions/**`
  - `web/src/pages/transactions/**`
  - `web/src/lib/money.ts`

## Tiến độ theo 3 ngày

### Ngày 1 (chốt phạm vi + dựng khung)

- Sáng: chốt ranh giới, dựng scaffold theo từng lane
- Chiều: bắt đầu code theo lane + trưởng nhóm review nhanh

### Ngày 2 (làm song song)

- Sáng: hoàn thiện logic chính theo từng lane
- Chiều: hoàn thiện test + sửa lỗi trong lane

### Ngày 3 (tích hợp + ổn định)

- Sáng: merge backend trước (Minh -> Tuân), chạy check API
- Chiều: rebase frontend, merge frontend, regression cuối

## Thứ tự merge

1. `feat/integration-shared` (nếu cần)
2. `feat/be-recurring-rules-api`
3. `feat/be-recurring-jobs`
4. `feat/web-transactions`

## Luật bắt buộc

- Không sửa file ngoài lane của mình
- Rebase lúc 10:00 và 16:00 mỗi ngày
- PR nhỏ, đúng một mục tiêu
- Pass check trước khi gửi review

## Lệnh kiểm tra

- Backend lanes:
  - `npm run lint -w api`
  - `npm run typecheck -w api`
  - `npm run test -w api`
- Frontend lane:
  - `npm run lint -w web`
  - `npm run typecheck -w web`
  - `npm run test -w web`

## Mẫu standup (mỗi người 60-90 giây)

- Hôm qua: đã xong gì
- Hôm nay: sửa chính xác file/module nào
- Rủi ro: blocker hoặc nguy cơ xung đột
- Cần hỗ trợ: cần ai giúp việc gì

## Escalation nhanh

- Cần sửa hotspot: tag Phúc, không tự sửa trực tiếp
- Cần đổi schema: dừng lại và chốt với Phúc trước
- Cần đổi hợp đồng API: Minh và Nhật Anh đồng bộ trước khi merge

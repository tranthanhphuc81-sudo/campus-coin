---
applyTo: "api/**"
description: "Quy tắc riêng cho backend Express + Prisma của Campus Coin"
---
# Backend (api/)

- Luồng lớp: route → controller (mỏng) → service (nghiệp vụ) → repository (Prisma). Module không gọi repository của module khác.
- Mọi truy vấn dữ liệu người dùng có điều kiện `userId` lấy từ `req.user.id`. Không nhận `userId`, `role`, `status` từ body/query.
- Validate bằng middleware `validate({ body, query, params })` với schema Zod; lỗi trả RFC 9457 qua `AppError` trong `src/lib/problem.ts`.
- Tiền: `Prisma.Decimal` trong code, chuỗi `"12.50"` trong JSON. Không dùng `Number` cho phép tính tiền.
- `$queryRaw` chỉ dùng tagged template (tham số hóa). Cấm `$queryRawUnsafe` với dữ liệu người dùng.
- Ngày/tháng tính theo `user.timezone`; `txn_date` là DATE địa phương.
- Ghi dữ liệu tài chính trong `prisma.$transaction`; phát sự kiện nội bộ SAU khi commit.
- Tác vụ định kỳ đặt trong `src/jobs` (node-cron), phải idempotent nhờ ràng buộc UNIQUE.
- Log bằng pino, không log mật khẩu, token, cookie, nội dung mô tả giao dịch đầy đủ.

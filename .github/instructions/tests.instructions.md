---
applyTo: "**/*.test.ts,**/*.test.tsx,**/tests/**"
description: "Quy tắc viết test cho Campus Coin"
---
# Test

- Vitest cho unit, Vitest + Supertest cho integration với MySQL thật (DB `campus_coin_test`); không mock Prisma trong integration test.
- Tên test tiếng Anh mô tả hành vi: `returns 404 when user B reads user A's transaction`.
- Mỗi endpoint: ít nhất 1 test thành công và 1 test bị từ chối (sai quyền hoặc sai dữ liệu).
- Gắn mã test case tài liệu (TC-01…TC-12) vào tên test khi tương ứng.
- Dữ liệu ngày cố định, không phụ thuộc ngày chạy; kiểm tra biên cuối tháng, năm nhuận, múi giờ Asia/Ho_Chi_Minh.

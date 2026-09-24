---
applyTo: "web/**"
description: "Quy tắc riêng cho frontend React của Campus Coin"
---
# Frontend (web/)

- Toàn bộ chuỗi giao diện bằng tiếng Anh (American English), đặt trong `src/content/en.ts`; không viết cứng chuỗi trong component.
- Gọi API qua `src/lib/api.ts` (axios có interceptor refresh). Không lưu access token vào localStorage/sessionStorage.
- Dữ liệu server dùng TanStack Query; đặt query key theo dạng `['transactions', filters]`; invalidate đúng key sau mutation.
- Form dùng React Hook Form + zodResolver với schema từ `@campus-coin/shared`; hiển thị lỗi theo field từ Problem Details `errors[]`.
- Hiển thị tiền qua `formatMoney()` trong `src/lib/money.ts`.
- Bootstrap 5.3 + React-Bootstrap; màu lấy từ CSS variables để dark mode tự hoạt động; kích thước dùng rem.
- Accessibility: mọi input có label, nút chỉ có icon có `aria-label`, không truyền thông tin chỉ bằng màu.
- Không dùng `dangerouslySetInnerHTML`.

# ADR-ADMIN-01: Phạm vi quyền và quyền riêng tư của vai trò admin

- **Trạng thái:** Accepted
- **Ngày:** 2026-09-27
- **Người quyết định:** _(đội xác nhận trước khi chuyển Accepted)_
- **Prompt tạo bản nháp:** p14-2a-admin-decide, GitHub Copilot (Claude Sonnet 5)

## Bối cảnh

Mục 5.13 (`docs/design/05-thiet-ke-chuc-nang.md`, Bảng 24) và mục 7.3.4 (`docs/design/07-thiet-ke-api.md`, Bảng 45) đã liệt kê các chức năng quản trị (tài khoản, danh mục mặc định, mẫu mẹo, thông báo, thống kê, audit log) cùng ràng buộc bảo mật ở mức nguyên tắc ("không xem chi tiết giao dịch cá nhân", "ẩn nhóm < 5 người dùng", "lọc HTML"). Mục 9.6/9.7/9.12 (`docs/design/09-bao-mat.md`) chốt ma trận phân quyền, ánh xạ OWASP và bảng sự kiện audit ở mức khung. ADR này **cụ thể hóa** các nguyên tắc đó thành danh sách trường, công thức, quy tắc kỹ thuật để đội thi công không tự suy diễn thêm quyền cho admin.

Đối chiếu với schema hiện có (`api/prisma/schema.prisma`) và thiết kế DB (mục 6.3.1, 6.3.9 `docs/design/06-thiet-ke-co-so-du-lieu.md`):

- Bảng `users` (thiết kế, Bảng 26) đã có sẵn `status ENUM('pending','active','disabled')` và `last_login_at` — **Prisma schema hiện tại (`model User`) chưa có hai cột này**, đây là việc thi công phải bổ sung, không phải quyết định mới của ADR này.
- Bảng `announcements` và `audit_logs` đã có ở thiết kế DB (mục 6.3.9, Bảng "announcements"/"audit_logs") nhưng **chưa có trong Prisma schema** — cần thêm khi thi công.
- `middlewares/auth.ts::requireAuth` hiện **hoàn toàn stateless** (chỉ `jwtVerify`, không tra DB) — access token còn hiệu lực tới `ACCESS_TOKEN_TTL` (900 giây) dù tài khoản vừa bị vô hiệu hóa. Đây là khoảng trống cần quyết định ở mục 3.
- `ai_category_rules.hit_count`/`consecutive_overrides` (ADR-AI-01) chỉ phục vụ luật gợi ý per-merchant; **tỷ lệ chấp nhận AI tổng hợp cho admin đã có công thức riêng ở ADR-AI-01 mục "accuracy"** (`ai_accepted / (ai_accepted + ai_overridden)` trên `transactions.ai_suggested_category_id`) — ADR này chỉ tham chiếu lại, không định nghĩa lại.

ADR này chỉ chốt **phạm vi dữ liệu, công thức và quy tắc**, không viết code thi công.

## Các quyết định

### 1. Trường admin được xem ở `/admin/users` và `/admin/users/{id}`

**Nguyên tắc:** admin không bao giờ thấy nội dung tài chính cá nhân (giao dịch, số tiền, mô tả, ngân sách, nhận định) của sinh viên — chỉ thấy metadata tài khoản và **số lượng** tổng hợp.

_**Trường trả về (giống nhau cho danh sách và chi tiết, không có trường tài chính bổ sung ở chi tiết):**_

| Trường             | Nguồn                                                            | Ghi chú                                                                                                                             |
| ------------------ | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `id`               | `users.id`                                                       | UUID v7, không nhạy cảm                                                                                                             |
| `fullName`         | `users.full_name`                                                |                                                                                                                                     |
| `email`            | `users.email`                                                    | **Che một phần** (thuật toán bên dưới) — áp dụng ở cả danh sách lẫn chi tiết (9.8: "email được che một phần trong giao diện admin") |
| `role`             | `users.role`                                                     | student / admin                                                                                                                     |
| `status`           | `users.status`                                                   | pending / active / disabled                                                                                                         |
| `emailVerifiedAt`  | `users.email_verified_at`                                        |                                                                                                                                     |
| `createdAt`        | `users.created_at`                                               |                                                                                                                                     |
| `lastLoginAt`      | `users.last_login_at`                                            |                                                                                                                                     |
| `aiOptIn`          | `users.ai_opt_in`                                                | Cấu hình tài khoản, không phải dữ liệu tài chính — hữu ích để hỗ trợ ("vì sao không có nhận định AI")                               |
| `transactionCount` | `COUNT(transactions) WHERE user_id = :id AND deleted_at IS NULL` | Đúng như Bảng 24 cho phép ("số giao dịch"); **chỉ số đếm, không phải danh sách/số tiền**                                            |

**Tuyệt đối KHÔNG trả về:** danh sách giao dịch, `amount`, `description`, số dư/tổng thu-chi, `budgets`, `insights`, `recurring_rules`, `categories` cá nhân, `monthly_allowance_baseline`, `monthly_savings_goal`.

**Thuật toán che email (áp dụng thống nhất mọi nơi admin thấy email):**

```
local, domain = email.split("@")
visibleCount = min(2, max(local.length - 3, 1))
masked = local.slice(0, visibleCount) + "***@" + domain
// ví dụ: "annguyen@fpt.edu.vn" -> "an***@fpt.edu.vn"
//        "ab@gmail.com"        -> "a***@gmail.com" (visibleCount=1 vì local ngắn)
```

Tìm kiếm (`GET /admin/users?q=`) vẫn khớp trên `email` **gốc** (server-side, chưa che) để admin tìm đúng người dùng; chỉ giá trị trả về trong response bị che.

_(Đây là thuật toán che cụ thể do AI đề xuất — thiết kế gốc chỉ ghi "che một phần", đội cần xác nhận cách che này chấp nhận được trước khi Accepted.)_

### 2. Thống kê tổng hợp và k-anonymity

**DAU/MAU — nguồn dữ liệu:**

| Phương án                                                                                                    | Ưu điểm                                                                             | Nhược điểm                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Dựa vào `users.last_login_at` (đếm user có `last_login_at` rơi vào ngày/tháng cần tính)                   | Không cần bảng phụ                                                                  | Cột chỉ lưu lần đăng nhập **gần nhất** — không dựng lại được DAU của các ngày trong quá khứ (ví dụ user đăng nhập ngày 1 và ngày 15, `last_login_at` chỉ còn ngày 15, DAU ngày 1 bị đếm thiếu) |
| B. Dựa vào `audit_logs` (đếm `DISTINCT actor_id` với `action = 'auth.login.success'` trong khoảng thời gian) | Có lịch sử đầy đủ, đúng định nghĩa DAU/MAU chuẩn, tận dụng bảng audit đã có ở 6.3.9 | Audit log tăng trưởng theo số lần đăng nhập; cần index `(action, created_at)` (đã có trong thiết kế DB)                                                                                        |

**Chốt:** B – DAU/MAU tính từ `audit_logs`, action `auth.login.success`, lọc `actor_role = 'student'` (không tính admin vào chỉ số hoạt động của sinh viên). `users.last_login_at` chỉ dùng để hiển thị ở `/admin/users` (mục 1), không dùng để tính thống kê tổng hợp.

```sql
-- DAU cho một ngày cụ thể (UTC)
SELECT COUNT(DISTINCT actor_id) AS dau
FROM audit_logs
WHERE action = 'auth.login.success' AND actor_role = 'student'
  AND created_at >= :dayStartUtc AND created_at < :dayEndUtc;

-- MAU cho một tháng cụ thể (UTC)
SELECT COUNT(DISTINCT actor_id) AS mau
FROM audit_logs
WHERE action = 'auth.login.success' AND actor_role = 'student'
  AND created_at >= :monthStartUtc AND created_at < :monthEndUtc;
```

**Các chỉ số còn lại:**

| Chỉ số                   | Công thức                                                                                                                                                                                                                                                      |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tổng giao dịch           | `COUNT(transactions) WHERE deleted_at IS NULL`, lọc theo khoảng thời gian nếu có tham số                                                                                                                                                                       |
| Danh mục dùng nhiều nhất | Nhóm theo `categories.id` **chỉ với `is_default = true`** (không gộp danh mục cá nhân của từng sinh viên vào bảng xếp hạng toàn hệ thống), đếm `transactions` theo `category_id`, sắp xếp giảm dần; kèm `distinctUserCount` cho mỗi danh mục để áp k-anonymity |
| Tỷ lệ chấp nhận gợi ý AI | Dùng nguyên công thức đã chốt ở ADR-AI-01 ("Đo lường độ chính xác"): `ai_accepted / (ai_accepted + ai_overridden)` trên `transactions.ai_suggested_category_id` — **không định nghĩa lại**                                                                     |
| Số nhận định đã sinh     | `COUNT(insights) WHERE status = 'completed'` trong khoảng thời gian; kèm phân rã theo `generator` (`llm` / `template`) để giám sát tỷ lệ fallback (hữu ích cho cảnh báo 9.12 "tỷ lệ lỗi AI > 20%")                                                             |

**Quy tắc k-anonymity (ẩn nhóm < 5 người dùng):**

- Áp dụng cho **mọi** số liệu được chia theo một chiều (breakdown) có thể thu hẹp về một nhóm nhỏ người dùng — cụ thể trong phạm vi hiện tại: "danh mục dùng nhiều nhất" (mỗi danh mục là một nhóm).
- Quy tắc: nếu `distinctUserCount` của một nhóm `< 5`, **service layer** (không phải chỉ ẩn ở UI) loại bỏ số liệu chi tiết của nhóm đó khỏi payload trả về; các nhóm bị ẩn được gộp chung vào một mục `"other"` chỉ hiển thị tổng số lượt giao dịch **nếu** tổng `distinctUserCount` gộp lại `≥ 5`, ngược lại bỏ hẳn khỏi response (không trả `0` hay giá trị giả).
- DAU/MAU: nếu tổng người dùng sinh viên đang `active` trong hệ thống `< 5`, toàn bộ hai chỉ số này trả `null` kèm `reason: "insufficient_data"` thay vì số thật.
- Kiểm tra k-anonymity phải nằm trong repository/service của `/admin/stats/*`, để không thể lộ số liệu thật qua việc chỉnh sửa response ở client.

### 3. Vô hiệu hóa tài khoản

**Hành động khi `POST /admin/users/{id}/disable`:**

1. Đặt `users.status = 'disabled'`.
2. **Thu hồi mọi refresh token đang hiệu lực ngay lập tức:** `UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = :id AND revoked_at IS NULL`.
3. Ghi `audit_logs` action `admin.user.disable`.

**Vấn đề cần quyết định:** `requireAuth` hiện tại (`api/src/middlewares/auth.ts`) chỉ `jwtVerify` chữ ký JWT, **không tra DB** — access token có sẵn (TTL 900 giây, `ACCESS_TOKEN_TTL`) vẫn dùng được sau khi tài khoản bị vô hiệu hóa, cho tới khi hết hạn. Điều này mâu thuẫn với yêu cầu "thu hồi mọi phiên **ngay**" (Bảng 24).

| Phương án                                                                                                                                                                                                                              | Ưu điểm                                                                                                                      | Nhược điểm                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| A. Giữ nguyên stateless, chấp nhận độ trễ tối đa 15 phút (TTL access token) trước khi vô hiệu hóa có hiệu lực hoàn toàn                                                                                                                | Không đổi middleware, không thêm truy vấn DB mỗi request                                                                     | Không đúng nghĩa "ngay"; sinh viên/admin bị vô hiệu hóa vẫn thao tác được tối đa 15 phút                         |
| B. `requireAuth` tra thêm `users.status`/`deleted_at` bằng một truy vấn khóa chính (`SELECT status, deleted_at FROM users WHERE id = ?`) sau khi `jwtVerify` thành công, trả `401` (Problem `account_disabled`) nếu không còn `active` | Vô hiệu hóa có hiệu lực ngay trong vòng < 1 request tiếp theo; đúng yêu cầu thiết kế; không cần Redis (đúng ràng buộc stack) | Thêm 1 truy vấn PK-lookup mỗi request đã xác thực (chi phí rất nhỏ với MySQL InnoDB, quy mô đồ án không đáng lo) |

**Chốt:** B – thêm bước tra `status`/`deleted_at` trong `requireAuth` bằng truy vấn khóa chính (đơn giản, có index PK sẵn), vì yêu cầu bảo mật "thu hồi ngay" quan trọng hơn chi phí một truy vấn PK nhỏ. Đây là thay đổi kỹ thuật ở middleware xác thực dùng chung cho mọi request — ghi vào checklist thi công, không chỉ riêng module admin.

**Ràng buộc nghiệp vụ bổ sung (service layer, không phải middleware):**

- **Admin không tự vô hiệu hóa chính mình:** nếu `targetUserId === req.user.id` → từ chối với Problem `422` (`cannot_disable_own_account`).
- **Không vô hiệu hóa admin cuối cùng:** trước khi disable một user có `role = 'admin'`, đếm `COUNT(users) WHERE role = 'admin' AND status = 'active' AND deleted_at IS NULL`; nếu kết quả `≤ 1` (tức đây là admin active cuối cùng) → từ chối với Problem `409` (`cannot_disable_last_admin`).
- **Kích hoạt lại (`/enable`):** chỉ chuyển `disabled → active`; không dùng để xác minh email thay (đó là luồng `pending → active` riêng của xác minh email).

### 4. Danh mục mặc định: ẩn thay vì xóa

- **Xóa (`DELETE /admin/categories/{id}`)** chỉ cho phép khi danh mục **không có bất kỳ tham chiếu nào** trên toàn hệ thống: `transactions`, `recurring_rules`, `budgets`, `import_rows`, `user_tips` đều không còn dòng nào trỏ tới `category_id` đó (kể cả đã `deleted_at` trên transactions — vẫn tính là còn tham chiếu, vì lịch sử vẫn cần hiển thị được nếu phục hồi). Nếu còn tham chiếu → API trả `409` và gợi ý dùng "ẩn" (`is_active = false`) thay vì xóa.
- **Ẩn (`is_active = false`):** danh mục biến mất khỏi danh sách chọn khi tạo giao dịch/ngân sách/định kỳ **mới**, nhưng giao dịch lịch sử vẫn hiển thị đầy đủ tên/màu/icon của danh mục (không đổi FK, không cascade).
- **Đổi tên danh mục mặc định:** vì `transactions.category_id` chỉ tham chiếu (không lưu snapshot tên tại thời điểm giao dịch), đổi tên **ảnh hưởng ngay lập tức tới cách hiển thị của mọi giao dịch lịch sử** đang dùng danh mục đó (báo cáo, PDF, export sẽ hiển thị tên mới). Đây là hành vi được **chấp nhận** (không snapshot tên vào từng giao dịch, để tránh thêm cột và logic đồng bộ ngoài phạm vi thiết kế hiện tại) — đội cần xác nhận đây là đánh đổi chấp nhận được. Audit log `admin.category.update` phải ghi `metadata.before.name` và `metadata.after.name` để có thể tra được tên cũ khi cần đối chiếu.

### 5. Lọc nội dung tip templates và announcements

| Phương án                                                                                                                           | Ưu điểm                                                                                                                                                                                                                        | Nhược điểm                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| A. Chỉ văn bản thuần (plain text) — không parse HTML/Markdown; xuống dòng giữ nguyên bằng CSS `white-space: pre-wrap` phía frontend | Không thêm thư viện mới (đúng AGENTS.md "không thêm framework lớn khi chưa hỏi"); loại bỏ hoàn toàn rủi ro XSS vì React tự escape text thuần; nhất quán với nguyên tắc 9.9 "đầu ra AI hiển thị văn bản thuần, không dùng HTML" | Admin không định dạng đậm/nghiêng được                                                                                                     |
| B. Allowlist thẻ an toàn tối thiểu (`<b>`, `<i>`, `<br>`, `<a>`) bằng thư viện sanitize (ví dụ `sanitize-html`)                     | Cho phép định dạng cơ bản                                                                                                                                                                                                      | Thêm dependency mới, thêm bề mặt tấn công (phải cấu hình allowlist đúng, dễ sai sót), vượt phạm vi "không thêm framework lớn khi chưa hỏi" |

**Chốt:** A – plain text thuần cho cả `tip_templates.title_tpl`/`body_tpl` và `announcements.title`/`body`. Biến trong template (`{{fullName}}`, `{{amount}}`, `{{month}}`, …) được thay thế bằng **string replace đơn giản theo whitelist tên biến cố định** (không dùng template engine thực thi mã như `eval`/`Function`/Handlebars có thể bị SSTI) — danh sách biến hợp lệ cố định trong code, biến không khớp whitelist giữ nguyên dạng `{{...}}` trong output (không throw, không nội suy tùy ý).

**Xem trước trước khi xuất bản:** thêm endpoint không lưu dữ liệu `POST /admin/tip-templates/preview` và `POST /admin/announcements/preview` nhận nội dung nháp + dữ liệu mẫu cố định (fixture, ví dụ `{ fullName: "Nguyễn Văn A", amount: "1,000,000", month: "2026-09" }`), trả về văn bản đã nội suy để admin xem đúng như sinh viên sẽ thấy trước khi `POST`/`PUT` bản chính thức. Không có trạng thái draft/publish riêng (giữ CRUD đơn giản với `is_active`); "xuất bản" = tạo/cập nhật với `is_active = true` sau khi đã gọi preview.

### 6. Hành động admin bắt buộc ghi `audit_logs`

Mọi action dưới đây ghi một dòng `audit_logs` với `actor_id`, `actor_role = 'admin'`, `action`, `entity_type`, `entity_id`, `ip_hash`, `user_agent`, `created_at`, và `metadata` JSON theo quy tắc: **action tạo mới** → `metadata` chứa snapshot các trường vừa tạo (trừ dữ liệu không cần thiết); **action cập nhật** → `metadata.before`/`metadata.after` chỉ chứa **các trường thay đổi** (không toàn bộ record); **action trên tài khoản người dùng** → `metadata` chỉ chứa `targetUserId` (+ `reason` nếu admin nhập, tùy chọn, không bắt buộc), **không bao giờ** ghi token/mật khẩu vào `metadata`.

| Action                                                                                              | Khi nào                                                                           |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `admin.login.success` / `admin.login.failed`                                                        | Đăng nhập admin (đã có ở Bảng 58)                                                 |
| `admin.user.disable` / `admin.user.enable`                                                          | Mục 3                                                                             |
| `admin.user.send_reset_link`                                                                        | Gửi link đặt lại mật khẩu hộ người dùng                                           |
| `admin.category.create` / `admin.category.update` / `admin.category.hide` / `admin.category.delete` | Mục 4 (`hide` là khi chuyển `is_active=false`, tách riêng `update` để dễ lọc log) |
| `admin.tip_template.create` / `admin.tip_template.update` / `admin.tip_template.delete`             | Mục 5                                                                             |
| `admin.announcement.create` / `admin.announcement.update` / `admin.announcement.delete`             | Mục 5                                                                             |

**Không bắt buộc ghi audit:** các truy vấn chỉ đọc (`GET /admin/stats/*`, `GET /admin/audit-logs`, `GET /admin/users`) — tránh làm phình bảng `audit_logs` bằng lượt xem không thay đổi dữ liệu; nếu sau này cần giám sát truy cập bất thường của chính admin, bổ sung riêng (ngoài phạm vi ADR này).

## Hệ quả

- Thi công phải bổ sung vào Prisma schema (chưa có, đã có ở thiết kế DB 6.3.1/6.3.9): `users.status`, `users.last_login_at`, model `Announcement`, model `AuditLog` — cùng migration tương ứng.
- `requireAuth` (`api/src/middlewares/auth.ts`) phải thêm bước tra `status`/`deleted_at` theo khóa chính sau khi `jwtVerify` (mục 3) — ảnh hưởng mọi route đã xác thực, không chỉ route admin.
- `/admin/users`, `/admin/users/{id}` không bao giờ trả `amount`, `description`, danh sách giao dịch, `budgets`, `insights` — mọi endpoint mới trong module `admin` phải tuân theo danh sách trường ở mục 1.
- `/admin/stats/*` phải áp k-anonymity ở service/repository layer trước khi serialize response.
- Tip templates/announcements không được render như HTML ở bất kỳ đâu (kể cả export PDF nếu có) — luôn coi là văn bản thuần.
- Danh mục mặc định không bao giờ bị xóa cứng khi còn tham chiếu; API xóa phải kiểm tra đủ 4 bảng liên quan (mục 4) trước khi cho phép.

## Checklist cho bước thi công

- [ ] Thêm `status`, `last_login_at` vào `model User`; cập nhật mọi nơi tạo user (register, seed) để set `status = 'pending'` mặc định đúng luồng xác minh email hiện có.
- [ ] Thêm `model Announcement`, `model AuditLog` vào Prisma schema đúng cột đã liệt kê ở 06-thiet-ke-co-so-du-lieu.md mục 6.3.9.
- [ ] Sửa `requireAuth` thêm kiểm tra `status !== 'active' || deleted_at !== null` → `401 account_disabled`.
- [ ] Viết repository `admin/users` chỉ `select` đúng whitelist trường ở mục 1 (không dùng `select: *`).
- [ ] Cài đặt hàm che email dùng chung (`packages/shared` hoặc `api/src/lib`) theo thuật toán mục 1.
- [ ] Cài đặt kiểm tra k-anonymity dùng chung cho mọi endpoint `/admin/stats/*`.
- [ ] Cài đặt guard "không tự vô hiệu hóa chính mình" và "không vô hiệu hóa admin cuối cùng" ở service disable.
- [ ] Endpoint preview cho tip templates và announcements (không lưu DB).
- [ ] Ghi `audit_logs` cho đủ danh sách action ở mục 6, kèm `metadata.before/after` cho action update.
- [ ] Test cross-tenant/role: student gọi mọi endpoint `/admin/*` phải bị từ chối; admin bị disable phải mất quyền truy cập ngay ở request tiếp theo (test cho middleware mới).

## Đội đã chỉnh sửa gì so với bản nháp AI

_(Điền khi đội rà soát và chuyển trạng thái sang Accepted.)_

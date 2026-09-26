<!-- Trích từ Tài liệu thiết kế kỹ thuật Campus Coin v1.0 (bản đã sửa). Nguồn gốc: file Word. Không sửa trực tiếp ở đây nếu chưa cập nhật file Word. -->

# 6. THIẾT KẾ CƠ SỞ DỮ LIỆU

## 6.1 Nguyên tắc thiết kế

- **Hệ quản trị:** MySQL 8.4 LTS, engine InnoDB, bộ ký tự utf8mb4 / collation utf8mb4_0900_ai_ci (lưu đúng tên/mô tả có dấu tiếng Việt và emoji do người dùng nhập).

- **Chuẩn hóa 3NF** cho dữ liệu nghiệp vụ; chỉ phi chuẩn hóa có chủ đích (snapshot JSON trong lịch sử, stats_snapshot trong insights).

- **Khóa chính:** UUID v7 dạng CHAR(36) cho users, transactions, import_batches, refresh_tokens (không đoán được); INT/BIGINT tự tăng cho bảng tra cứu và bảng log.

- **Tiền tệ:** DECIMAL(14,2) – không bao giờ dùng FLOAT/DOUBLE cho tiền; ràng buộc CHECK số tiền > 0.

- **Thời gian:** DATETIME(3) lưu theo UTC; txn_date và month là DATE theo múi giờ người dùng; month luôn là ngày đầu tháng.

- **Toàn vẹn:** khóa ngoại với ON DELETE RESTRICT cho dữ liệu tài chính, CASCADE cho dữ liệu phụ thuộc (token, thông báo); ENUM cho tập giá trị cố định.

- **Xóa mềm** (deleted_at) cho users và transactions; lịch sử thay đổi append-only.

- **Quyền tối thiểu:** ứng dụng dùng tài khoản cc_app chỉ có SELECT/INSERT/UPDATE/DELETE trên schema, riêng audit_logs và transaction_history chỉ có INSERT/SELECT; migration dùng tài khoản cc_migrator riêng.

## 6.2 Sơ đồ quan hệ thực thể (ERD)

### 6.2.1 ERD tổng quan

Hệ thống gồm 18 bảng, nhóm thành 4 miền: Xác thực & phiên, Tài chính lõi, AI & gợi ý, Tương tác; cộng bảng nhật ký kiểm toán. Hầu hết các bảng có quan hệ 1–n với USERS, bảo đảm mọi dữ liệu đều có chủ sở hữu rõ ràng để phân quyền.

_**Hình 23: ERD tổng quan – các miền dữ liệu và quan hệ**_ — ảnh: [images/hinh-23.png](images/hinh-23.png)

### 6.2.2 ERD chi tiết miền tài chính lõi

_**Hình 24: ERD chi tiết – Users, Categories, Transactions, Budgets, Recurring Rules**_ — ảnh: [images/hinh-24.png](images/hinh-24.png)

## 6.3 Từ điển dữ liệu

Các bảng dưới đây mở rộng từ gợi ý trong SRS (User, Category, Transaction, Budget, Insight). Mọi bảng (trừ bảng log) đều có created_at và updated_at DATETIME(3) – được lược bớt trong bảng mô tả để ngắn gọn.

### 6.3.1 Bảng users

_**Bảng 26: users – Người dùng (sinh viên và quản trị viên)**_

| **Cột**                    | **Kiểu dữ liệu**                    | **Ràng buộc**              | **Mô tả**                                    |
| -------------------------- | ----------------------------------- | -------------------------- | -------------------------------------------- |
| id                         | CHAR(36)                            | PK                         | UUID v7                                      |
| email                      | VARCHAR(254)                        | UNIQUE, NOT NULL           | Email đăng nhập, lưu chữ thường              |
| password_hash              | VARCHAR(255)                        | NOT NULL                   | Chuỗi Argon2id đã mã hóa (gồm salt, tham số) |
| full_name                  | VARCHAR(100)                        | NOT NULL                   | Họ tên                                       |
| role                       | ENUM('student','admin')             | DEFAULT 'student'          | Vai trò                                      |
| status                     | ENUM('pending','active','disabled') | DEFAULT 'pending'          | Trạng thái tài khoản                         |
| academic_year              | VARCHAR(20)                         | NULL                       | Năm học (tùy chọn)                           |
| monthly_allowance_baseline | DECIMAL(14,2)                       | NULL, CHECK ≥ 0            | Mức trợ cấp cơ sở hằng tháng                 |
| monthly_savings_goal       | DECIMAL(14,2)                       | NULL, CHECK ≥ 0            | Mục tiêu tiết kiệm hằng tháng                |
| currency                   | CHAR(3)                             | DEFAULT 'USD'              | Mã tiền tệ ISO 4217                          |
| timezone                   | VARCHAR(40)                         | DEFAULT 'Asia/Ho_Chi_Minh' | Múi giờ IANA                                 |
| preferences                | JSON                                | NULL                       | {theme, fontScale}                           |
| ai_opt_in                  | BOOLEAN                             | DEFAULT FALSE              | Đồng ý gửi dữ liệu ẩn danh tới LLM           |
| email_verified_at          | DATETIME(3)                         | NULL                       | Thời điểm xác minh email                     |
| failed_login_count         | TINYINT UNSIGNED                    | DEFAULT 0                  | Số lần đăng nhập sai liên tiếp               |
| locked_until               | DATETIME(3)                         | NULL                       | Khóa đăng nhập tạm thời tới                  |
| last_login_at              | DATETIME(3)                         | NULL                       | Lần đăng nhập cuối                           |
| deleted_at                 | DATETIME(3)                         | NULL                       | Yêu cầu xóa tài khoản (ân hạn 30 ngày)       |

### 6.3.2 Bảng refresh_tokens và auth_tokens

_**Bảng 27: refresh_tokens – Phiên đăng nhập**_

| **Cột**        | **Kiểu dữ liệu** | **Ràng buộc**       | **Mô tả**                                       |
| -------------- | ---------------- | ------------------- | ----------------------------------------------- |
| id             | CHAR(36)         | PK                  | UUID v7                                         |
| user_id        | CHAR(36)         | FK → users, CASCADE | Chủ phiên                                       |
| token_hash     | CHAR(64)         | UNIQUE              | SHA-256 của refresh token (không lưu token gốc) |
| family_id      | CHAR(36)         | INDEX               | Họ token để phát hiện dùng lại                  |
| user_agent     | VARCHAR(255)     | NULL                | Thiết bị (hiển thị danh sách phiên)             |
| ip_hash        | CHAR(64)         | NULL                | HMAC-SHA256 của IP (bảo vệ quyền riêng tư)      |
| expires_at     | DATETIME(3)      | NOT NULL            | Hết hạn                                         |
| revoked_at     | DATETIME(3)      | NULL                | Thời điểm thu hồi                               |
| replaced_by_id | CHAR(36)         | NULL                | Token mới sau khi xoay vòng                     |

_**Bảng 28: auth_tokens – Token xác minh email / đặt lại mật khẩu**_

| **Cột**    | **Kiểu dữ liệu**                      | **Ràng buộc**       | **Mô tả**         |
| ---------- | ------------------------------------- | ------------------- | ----------------- |
| id         | BIGINT                                | PK, AUTO_INCREMENT  |                   |
| user_id    | CHAR(36)                              | FK → users, CASCADE |                   |
| purpose    | ENUM('verify_email','reset_password') | NOT NULL            | Mục đích          |
| token_hash | CHAR(64)                              | UNIQUE              | SHA-256 của token |
| expires_at | DATETIME(3)                           | NOT NULL            | 24 giờ / 30 phút  |
| used_at    | DATETIME(3)                           | NULL                | Dùng một lần      |

### 6.3.3 Bảng categories

_**Bảng 29: categories – Danh mục thu/chi**_

| **Cột**     | **Kiểu dữ liệu**         | **Ràng buộc**                          | **Mô tả**                                         |
| ----------- | ------------------------ | -------------------------------------- | ------------------------------------------------- |
| id          | INT                      | PK, AUTO_INCREMENT                     |                                                   |
| user_id     | CHAR(36)                 | FK → users, NULL                       | NULL = danh mục mặc định của hệ thống             |
| owner_key   | VARCHAR(36)              | GENERATED = COALESCE(user_id,'SYSTEM') | Cột sinh để ràng buộc duy nhất hoạt động với NULL |
| name        | VARCHAR(50)              | NOT NULL                               | Tên danh mục                                      |
| type        | ENUM('income','expense') | NOT NULL                               | Loại                                              |
| icon        | VARCHAR(40)              | NULL                                   | Tên biểu tượng                                    |
| color       | CHAR(7)                  | NULL                                   | Mã màu HEX                                        |
| is_default  | BOOLEAN                  | DEFAULT FALSE                          | Danh mục hệ thống                                 |
| is_active   | BOOLEAN                  | DEFAULT TRUE                           | FALSE = đã lưu trữ/ẩn                             |
| sort_order  | SMALLINT                 | DEFAULT 0                              | Thứ tự hiển thị                                   |
| (ràng buộc) |                          | UNIQUE(owner_key, type, name)          | Không trùng tên trong phạm vi chủ sở hữu và loại  |

### 6.3.4 Bảng transactions và transaction_history

_**Bảng 30: transactions – Giao dịch thu/chi**_

| **Cột**                  | **Kiểu dữ liệu**                                           | **Ràng buộc**              | **Mô tả**                                               |
| ------------------------ | ---------------------------------------------------------- | -------------------------- | ------------------------------------------------------- |
| id                       | CHAR(36)                                                   | PK                         | UUID v7                                                 |
| user_id                  | CHAR(36)                                                   | FK → users, RESTRICT       | Chủ sở hữu                                              |
| category_id              | INT                                                        | FK → categories, RESTRICT  | Danh mục                                                |
| type                     | ENUM('income','expense')                                   | NOT NULL                   | Loại giao dịch                                          |
| amount                   | DECIMAL(14,2)                                              | NOT NULL, CHECK > 0        | Số tiền                                                 |
| currency                 | CHAR(3)                                                    | NOT NULL                   | Tiền tệ tại thời điểm ghi                               |
| description              | VARCHAR(255)                                               | NULL                       | Ghi chú tự do                                           |
| merchant_key             | VARCHAR(100)                                               | NULL, INDEX                | Mô tả chuẩn hóa cho AI/trùng lặp                        |
| txn_date                 | DATE                                                       | NOT NULL                   | Ngày giao dịch (giờ địa phương)                         |
| source                   | ENUM('manual','recurring','csv_import')                    | DEFAULT 'manual'           | Nguồn tạo                                               |
| recurring_rule_id        | INT                                                        | FK → recurring_rules, NULL | Quy tắc sinh ra (nếu có)                                |
| recurring_period         | CHAR(10)                                                   | NULL                       | Kỳ định kỳ (vd. 2026-09); UNIQUE cùng recurring_rule_id |
| import_batch_id          | CHAR(36)                                                   | FK → import_batches, NULL  | Lô nhập CSV                                             |
| ai_suggested_category_id | INT                                                        | NULL                       | Danh mục AI gợi ý (theo SRS)                            |
| ai_confidence            | DECIMAL(4,3)                                               | NULL                       | Độ tin cậy gợi ý 0–1                                    |
| category_source          | ENUM('user','ai_accepted','ai_overridden','rule','import') | DEFAULT 'user'             | Cách danh mục được chọn – đo chất lượng AI              |
| is_anomaly               | BOOLEAN                                                    | DEFAULT FALSE              | Cờ bất thường                                           |
| is_possible_duplicate    | BOOLEAN                                                    | DEFAULT FALSE              | Cờ nghi trùng                                           |
| version                  | INT                                                        | DEFAULT 1                  | Khóa lạc quan                                           |
| deleted_at               | DATETIME(3)                                                | NULL                       | Xóa mềm                                                 |

_**Bảng 31: transaction_history – Lịch sử thay đổi giao dịch (append-only)**_

| **Cột**        | **Kiểu dữ liệu**                           | **Ràng buộc**      | **Mô tả**                                             |
| -------------- | ------------------------------------------ | ------------------ | ----------------------------------------------------- |
| id             | BIGINT                                     | PK, AUTO_INCREMENT |                                                       |
| transaction_id | CHAR(36)                                   | INDEX              | Giao dịch (không FK để giữ lịch sử khi xóa vĩnh viễn) |
| user_id        | CHAR(36)                                   | INDEX              | Chủ sở hữu                                            |
| action         | ENUM('create','update','delete','restore') | NOT NULL           | Hành động                                             |
| snapshot       | JSON                                       | NOT NULL           | Trạng thái đầy đủ sau thay đổi                        |
| changed_fields | JSON                                       | NULL               | Danh sách trường thay đổi và giá trị cũ               |
| changed_by     | CHAR(36)                                   | NOT NULL           | Người thực hiện (hoặc SYSTEM)                         |
| changed_at     | DATETIME(3)                                | NOT NULL           | Thời điểm                                             |

### 6.3.5 Bảng recurring_rules và budgets

_**Bảng 32: recurring_rules – Quy tắc giao dịch định kỳ**_

| **Cột**                    | **Kiểu dữ liệu**                  | **Ràng buộc**         | **Mô tả**            |
| -------------------------- | --------------------------------- | --------------------- | -------------------- |
| id                         | INT                               | PK                    |                      |
| user_id                    | CHAR(36)                          | FK → users            |                      |
| category_id                | INT                               | FK → categories       |                      |
| type                       | ENUM('income','expense')          | NOT NULL              |                      |
| amount                     | DECIMAL(14,2)                     | CHECK > 0             |                      |
| description                | VARCHAR(255)                      | NULL                  |                      |
| frequency                  | ENUM('weekly','monthly','yearly') | NOT NULL              | Tần suất             |
| interval_count             | TINYINT                           | DEFAULT 1, CHECK 1–12 | Mỗi N kỳ             |
| day_of_month / day_of_week | TINYINT                           | NULL                  | Ngày chạy            |
| start_date / end_date      | DATE                              | end_date NULL         | Hiệu lực             |
| next_run_date              | DATE                              | INDEX                 | Lần sinh kế tiếp     |
| is_active                  | BOOLEAN                           | DEFAULT TRUE          | Tạm dừng / hoạt động |

_**Bảng 33: budgets – Ngân sách theo danh mục và tháng**_

| **Cột**             | **Kiểu dữ liệu** | **Ràng buộc**                       | **Mô tả**                    |
| ------------------- | ---------------- | ----------------------------------- | ---------------------------- |
| id                  | INT              | PK                                  |                              |
| user_id             | CHAR(36)         | FK → users                          |                              |
| category_id         | INT              | FK → categories (loại expense)      |                              |
| month               | DATE             | NOT NULL                            | Ngày đầu tháng áp dụng       |
| limit_amount        | DECIMAL(14,2)    | CHECK > 0                           | Hạn mức                      |
| alert_threshold_pct | TINYINT          | DEFAULT 80, CHECK 50–100            | Ngưỡng cảnh báo              |
| (ràng buộc)         |                  | UNIQUE(user_id, category_id, month) | Một ngân sách/danh mục/tháng |

### 6.3.6 Bảng insights, tip_templates, user_tips

_**Bảng 34: insights – Nhận định hằng tháng**_

| **Cột**                | **Kiểu dữ liệu**                                 | **Ràng buộc**          | **Mô tả**                             |
| ---------------------- | ------------------------------------------------ | ---------------------- | ------------------------------------- |
| id                     | INT                                              | PK                     |                                       |
| user_id                | CHAR(36)                                         | FK → users, CASCADE    |                                       |
| month                  | DATE                                             | UNIQUE(user_id, month) | Tháng được nhận định                  |
| summary_text           | TEXT                                             | NULL                   | Tóm tắt tường thuật                   |
| tip_text               | TEXT                                             | NULL                   | Lời khuyên hành động                  |
| flagged_patterns       | JSON                                             | NULL                   | Danh sách mẫu tăng trưởng bất thường  |
| stats_snapshot         | JSON                                             | NULL                   | Số liệu đầu vào (tái lập, kiểm chứng) |
| generator              | ENUM('llm','template')                           | NOT NULL               | Nguồn sinh                            |
| model / prompt_version | VARCHAR(60) / VARCHAR(20)                        | NULL                   | Truy vết mô hình và prompt            |
| status                 | ENUM('queued','processing','completed','failed') | NOT NULL               | Trạng thái job                        |
| regenerate_count       | TINYINT                                          | DEFAULT 0, ≤ 3         | Số lần tạo lại                        |
| generated_at           | DATETIME(3)                                      | NULL                   |                                       |

_**Bảng 35: tip_templates – Mẫu mẹo (admin quản lý)**_

| **Cột**              | **Kiểu dữ liệu**                                                                                              | **Ràng buộc** | **Mô tả**                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------ |
| id                   | INT                                                                                                           | PK            |                                                  |
| code                 | VARCHAR(40)                                                                                                   | UNIQUE        | Mã mẫu, vd. R1_OVER_BUDGET                       |
| rule_type            | ENUM('over_budget','above_average','small_frequent', 'subscriptions','savings_gap','weekend_spike','general') | NOT NULL      | Quy tắc gắn với mẫu                              |
| title_tpl / body_tpl | VARCHAR(150) / VARCHAR(500)                                                                                   | NOT NULL      | Nội dung có biến {category}, {amount}, {percent} |
| locale               | VARCHAR(5)                                                                                                    | DEFAULT 'en'  | Ngôn ngữ (hiện chỉ dùng 'en')                    |
| is_active            | BOOLEAN                                                                                                       | DEFAULT TRUE  |                                                  |
| created_by           | CHAR(36)                                                                                                      | FK → users    | Admin tạo                                        |

_**Bảng 36: user_tips – Mẹo đã sinh cho người dùng**_

| **Cột**                        | **Kiểu dữ liệu**                    | **Ràng buộc**                                     | **Mô tả**                |
| ------------------------------ | ----------------------------------- | ------------------------------------------------- | ------------------------ |
| id                             | BIGINT                              | PK                                                |                          |
| user_id                        | CHAR(36)                            | FK → users, CASCADE                               |                          |
| template_id                    | INT                                 | FK → tip_templates                                |                          |
| category_id                    | INT                                 | NULL                                              | Danh mục liên quan       |
| period                         | DATE                                | NOT NULL                                          | Tháng                    |
| rendered_title / rendered_body | VARCHAR(200) / VARCHAR(600)         |                                                   | Nội dung đã điền số liệu |
| impact_amount                  | DECIMAL(14,2)                       |                                                   | Tiết kiệm tiềm năng      |
| score                          | DECIMAL(12,4)                       | INDEX                                             | Điểm xếp hạng            |
| status                         | ENUM('active','pinned','dismissed') | DEFAULT 'active'                                  |                          |
| dismissed_until                | DATE                                | NULL                                              | Ẩn tới ngày              |
| (ràng buộc)                    |                                     | UNIQUE(user_id, template_id, category_id, period) |                          |

### 6.3.7 Các bảng tương tác, AI và hệ thống

_**Bảng 37: Các bảng bổ trợ**_

| **Bảng**          | **Cột chính**                                                                                                                                                                               | **Ràng buộc / Chỉ mục**                                                                            | **Mục đích**                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| notifications     | id, user_id, type ENUM(budget_near, budget_exceeded, insight_ready, anomaly, duplicate, system), title, body, payload JSON, dedupe_key, read_at                                             | UNIQUE(user_id, dedupe_key); INDEX(user_id, read_at, created_at)                                   | Thông báo trong ứng dụng                                   |
| bookmarks         | id, user_id, target_type ENUM(tip, insight, report), target_ref VARCHAR(64), note VARCHAR(500)                                                                                              | UNIQUE(user_id, target_type, target_ref)                                                           | Bookmark và ghi chú                                        |
| ai_category_rules | id, user_id, merchant_key, category_id, hit_count, consecutive_overrides, last_used_at                                                                                                      | UNIQUE(user_id, merchant_key); FK user_id → users (CASCADE); FK category_id → categories (CASCADE) | Luật phân loại học từ người dùng                           |
| ai_usage_daily    | user_id, usage_date, call_count                                                                                                                                                             | PRIMARY KEY(user_id, usage_date); FK user_id → users (CASCADE)                                     | Đếm quota gọi LLM hằng ngày, bền qua lần khởi động lại API |
| import_batches    | id, user_id, original_filename, file_sha256, status ENUM(uploaded, parsing, previewed, committed, failed, expired), total_rows, valid_rows, committed_rows, error_report JSON, committed_at | UNIQUE(user_id, file_sha256)                                                                       | Theo dõi lô nhập CSV                                       |
| recent_activity   | id, user_id, transaction_id, action ENUM(viewed, edited), occurred_at                                                                                                                       | INDEX(user_id, occurred_at); giữ 20 bản ghi/người                                                  | Giao dịch xem/sửa gần đây                                  |
| announcements     | id, title, body, level ENUM(info, warning), starts_at, ends_at, is_active, created_by                                                                                                       | INDEX(is_active, starts_at, ends_at)                                                               | Thông báo hệ thống                                         |
| audit_logs        | id BIGINT, actor_id, actor_role, action, entity_type, entity_id, ip_hash, user_agent, metadata JSON, created_at                                                                             | INDEX(actor_id, created_at), INDEX(action, created_at); chỉ INSERT/SELECT                          | Nhật ký kiểm toán bất biến                                 |

## 6.4 Chỉ mục và tối ưu truy vấn

_**Bảng 38: Chỉ mục chính**_

| **Bảng**            | **Chỉ mục**                                 | **Phục vụ truy vấn**                                     |
| ------------------- | ------------------------------------------- | -------------------------------------------------------- |
| transactions        | (user_id, deleted_at, txn_date DESC)        | Danh sách giao dịch, lọc theo thời gian, dashboard tháng |
| transactions        | (user_id, category_id, txn_date)            | Tổng theo danh mục, ngân sách, báo cáo, tips             |
| transactions        | (user_id, type, txn_date)                   | Báo cáo thu vs chi 6 tháng                               |
| transactions        | (user_id, merchant_key)                     | Phát hiện trùng lặp, gợi ý AI                            |
| transactions        | UNIQUE(recurring_rule_id, recurring_period) | Chống sinh trùng giao dịch định kỳ                       |
| transaction_history | (transaction_id, changed_at)                | Xem lịch sử một giao dịch                                |
| budgets             | UNIQUE(user_id, category_id, month)         | Tra ngân sách khi có giao dịch                           |
| recurring_rules     | (is_active, next_run_date)                  | Job sinh giao dịch hằng ngày                             |
| refresh_tokens      | UNIQUE(token_hash), (user_id), (family_id)  | Làm mới/thu hồi phiên                                    |

Mọi truy vấn danh sách đều phân trang; báo cáo chỉ chọn cột cần thiết; truy vấn tổng hợp được kiểm tra bằng EXPLAIN trong quá trình review. Khi dữ liệu tăng lớn, bổ sung bảng tổng hợp monthly_category_totals cập nhật theo sự kiện (xem mục 10.4).

## 6.5 Dữ liệu khởi tạo (Seed)

- 12 danh mục mặc định (5 thu nhập, 7 chi tiêu) theo SRS, kèm biểu tượng và màu.

- Khoảng 15 mẫu mẹo (tip_templates) bằng tiếng Anh cho 7 quy tắc.

- Từ điển từ khóa phân loại (tầng 2) dưới dạng file cấu hình có phiên bản.

- Tài khoản demo và dữ liệu mẫu 6 tháng cho môi trường demo (mục 11.5, 12.3); **không** chạy seed demo trên production thật.

## 6.6 Migration, lưu giữ và xóa dữ liệu

- Migration quản lý bằng Prisma Migrate, lưu trong Git, review bắt buộc; chạy migrate deploy sau khi backup trong pipeline triển khai; thay đổi phá vỡ thực hiện theo mô hình expand → migrate → contract.

- SRS yêu cầu nộp file SQL/schema: xuất script DDL đầy đủ từ migration thành campus_coin_schema.sql kèm seed.sql trong gói nộp.

_**Bảng 39: Chính sách lưu giữ dữ liệu**_

| **Dữ liệu**                                 | **Thời gian lưu giữ**             | **Xử lý khi hết hạn**                                           |
| ------------------------------------------- | --------------------------------- | --------------------------------------------------------------- |
| Giao dịch, ngân sách, nhận định             | Suốt thời gian tài khoản tồn tại  | Xóa cùng tài khoản                                              |
| Giao dịch đã xóa mềm                        | 30 ngày                           | Xóa vĩnh viễn; lịch sử được ẩn danh hóa mô tả                   |
| Tài khoản yêu cầu xóa                       | 30 ngày ân hạn                    | Xóa vĩnh viễn toàn bộ dữ liệu cá nhân, giữ audit log đã ẩn danh |
| Token xác minh/reset, refresh token hết hạn | 7 ngày sau hết hạn                | Xóa bởi job dọn dẹp                                             |
| Bản xem trước import CSV                    | 24 giờ                            | Xóa khỏi DB                                                     |
| Audit log                                   | 12 tháng                          | Lưu trữ nén ngoài hệ thống rồi xóa                              |
| Bản sao lưu                                 | 7 bản hằng ngày + 4 bản hằng tuần | Tự động xoay vòng                                               |

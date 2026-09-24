# HƯỚNG DẪN ĐƯA PROMPT KIT CAMPUS COIN VÀO VS CODE

Tài liệu này hướng dẫn từng thao tác để biến bộ prompt kit thành **lệnh gõ `/` ngay trong khung chat AI của VS Code**. Kit chạy được với **GitHub Copilot Chat** và **Claude Code** (extension cho VS Code). Đội có thể dùng một trong hai hoặc cả hai; mọi lệnh đều sinh từ cùng một nguồn nên luôn giống nhau.

---

## 1. Kit gồm những gì

Giải nén `campus-coin-ai-kit.zip` vào thư mục gốc repo, bạn có:

```text
campus-coin/
├── AGENTS.md                      ← Quy tắc chung cho mọi AI (nguồn DUY NHẤT)
├── CLAUDE.md                      ← Claude Code đọc file này, nó nạp lại AGENTS.md
├── package.json                   ← Có sẵn script "prompts:build"
├── .github/
│   ├── copilot-instructions.md    ← SINH TỰ ĐỘNG từ AGENTS.md (đừng sửa tay)
│   ├── instructions/              ← Quy tắc theo thư mục: api/**, web/**, test
│   ├── prompts/                   ← 51 lệnh cho Copilot: /p1-1-init-monorepo ...
│   └── pull_request_template.md   ← Checklist Definition of Done khi mở PR
├── .claude/commands/campus/       ← 51 lệnh cho Claude Code (cùng tên)
├── .vscode/
│   ├── extensions.json            ← Extension khuyến nghị
│   └── settings.json              ← Bật prompt files, instruction files, AGENTS.md
├── docs/
│   ├── design/                    ← Tài liệu thiết kế v1.0 tách theo chương (Markdown)
│   │   ├── diagrams/              ← Mã nguồn Mermaid các sơ đồ
│   │   ├── images/                ← Ảnh 29 hình
│   │   └── word/                  ← Bản Word v1.0 và v1.1 (bản nộp)
│   ├── srs/                       ← SRS gốc (PDF + bản văn bản cho AI đọc)
│   ├── decisions/                 ← ADR: mẫu + bảng theo dõi trạng thái
│   ├── security/                  ← Nơi lưu kết quả rà soát bảo mật
│   ├── prompt-kit/                ← Bản prompt kit đầy đủ + hướng dẫn này
│   └── ai-usage-log.md            ← Nhật ký dùng AI (SRS bắt buộc)
└── tools/prompt-kit/
    ├── prompts.source.json        ← NGUỒN của 51 prompt – sửa prompt ở đây
    ├── tiers.json                 ← Ánh xạ 🟢/🔵/🔴 → model
    └── build.mjs                  ← Sinh lại .github/prompts và .claude/commands
```

**Vì sao tài liệu thiết kế được tách thành Markdown theo chương?** AI không đọc tốt file Word, và đính kèm cả tài liệu 100 trang làm loãng ngữ cảnh. Mỗi lệnh chỉ trỏ đúng các chương nó cần (ví dụ lệnh schema chỉ đọc chương 6 và 7).

**Hai file tự động làm gì?** `AGENTS.md` được Copilot và Claude Code nạp ở **mọi** phiên chat, nên bạn không cần dán "Khối ngữ cảnh chung" như bản kit dạng tài liệu nữa. Các file trong `.github/instructions/` chỉ được nạp khi AI làm việc với file khớp đường dẫn (ví dụ quy tắc frontend chỉ áp dụng cho `web/**`).

---

## 2. Chuẩn bị một lần cho mỗi máy

### 2.1 Phần mềm

| Phần mềm | Phiên bản | Ghi chú |
|---|---|---|
| VS Code | Bản mới nhất | Cập nhật để có đủ tính năng prompt files và agent |
| Node.js | 24 LTS | Dùng nvm/fnm để khớp file `.nvmrc` sau này |
| Git | Bản mới | Cấu hình `user.name`, `user.email` |
| Docker Desktop | Bản mới | Chạy MySQL và Mailpit khi dev |

### 2.2 Công cụ AI – chọn một hoặc cả hai

**GitHub Copilot Chat.** Cần gói Copilot có **model picker** (cho phép chọn model Claude, GPT, Gemini…). Đăng nhập GitHub trong VS Code. Ưu điểm: chọn nhiều hãng model trong một chỗ, dễ xem diff từng file.

**Claude Code (extension VS Code).** Cần tài khoản Claude có quyền dùng Claude Code. Ưu điểm: lệnh `/` đã khai báo sẵn model theo cấp (haiku/sonnet/opus), mạnh với tác vụ nhiều file, có chế độ Plan cho bước quyết định.

**Gợi ý phân công:** dùng Claude Code cho các lệnh 🔵 và 🔴 (thi công nhiều file và quyết định kiến trúc); dùng Copilot cho gợi ý code khi gõ và các lệnh 🟢 nhỏ.

### 2.3 Extension

Khi mở repo lần đầu, VS Code hiện thông báo *"Do you want to install the recommended extensions?"* → chọn **Install**. Nếu lỡ bỏ qua: mở Command Palette (`Ctrl+Shift+P`) → gõ `Extensions: Show Recommended Extensions` → cài hết.

---

## 3. Đưa kit vào repo

1. Tạo thư mục dự án và khởi tạo Git:

   ```bash
   mkdir campus-coin && cd campus-coin
   git init -b main
   ```

2. Giải nén `campus-coin-ai-kit.zip` vào **đúng thư mục này** (các file `AGENTS.md`, `package.json`, thư mục `.github`, `.claude` nằm ngay ở gốc). Lưu ý các thư mục bắt đầu bằng dấu chấm bị ẩn trên macOS/Linux – kiểm tra bằng `ls -la`.

3. Mở bằng VS Code: `code .`

4. Commit đầu tiên:

   ```bash
   git add .
   git commit -m "chore: add AI prompt kit, design docs and agent rules"
   ```

5. Tạo repo trên GitHub (để **Private** cho tới khi nộp) rồi `git push -u origin main`. Nhờ vậy cả đội dùng chung đúng một bộ lệnh.

---

## 4. Kiểm tra AI đã nhận kit

### 4.1 Với GitHub Copilot

1. Mở Chat: `Ctrl+Alt+I` (macOS: `Ctrl+Cmd+I`).
2. Ở ô chọn chế độ dưới khung chat, chọn **Agent**.
3. Gõ `/p` → danh sách hiện các lệnh `/p1-1-init-monorepo`, `/p2-1a-db-schema-decide`… Mỗi dòng có mô tả bắt đầu bằng 🟢/🔵/🔴.
4. Hỏi thử: *"Theo quy tắc dự án, số tiền trả về trong JSON có định dạng thế nào?"* – AI phải trả lời "chuỗi như "12.50"". Mở phần **References** dưới câu trả lời, phải thấy `copilot-instructions.md` hoặc `AGENTS.md`.

Nếu gõ `/` mà không thấy lệnh: xem mục 11 (Xử lý sự cố).

### 4.2 Với Claude Code

1. Mở panel Claude Code (biểu tượng Claude trên thanh bên, hoặc Command Palette → `Claude Code: Open`).
2. Gõ `/p` → thấy các lệnh kèm nhãn *(project:campus)*.
3. Hỏi cùng câu hỏi như trên để kiểm tra `CLAUDE.md` đã được nạp.

### 4.3 Gán model cho từng cấp (khuyến nghị làm ngay)

Mở `tools/prompt-kit/tiers.json`:

```json
{
  "copilot": { "🟢": "", "🔵": "", "🔴": "" },
  "claude":  { "🟢": "haiku", "🔵": "sonnet", "🔴": "opus" }
}
```

- **Claude Code:** đã điền sẵn alias `haiku` / `sonnet` / `opus`, luôn trỏ tới model mới nhất của mỗi dòng. Không cần sửa.
- **Copilot:** mở model picker trong khung chat, chép **đúng nguyên văn** tên model muốn dùng cho từng cấp (tên thường kèm hậu tố, ví dụ `(copilot)`), dán vào ba ô. Để trống thì lệnh dùng model đang chọn trong picker – khi đó bạn tự chọn model theo biểu tượng 🟢/🔵/🔴 trước khi chạy.

Sau khi sửa, sinh lại lệnh:

```bash
npm run prompts:build
```

---

## 5. Quy trình chuẩn cho MỘT lệnh

Mỗi lệnh (một prompt) đi qua đúng 8 bước sau. Làm quen với vòng lặp này là dùng được toàn bộ kit.

| Bước | Việc làm | Mất khoảng |
|---|---|---|
| 1 | Tạo nhánh | 10 giây |
| 2 | Mở phiên chat MỚI, chọn chế độ và model | 10 giây |
| 3 | Chạy lệnh `/...` | 2–20 phút (AI làm) |
| 4 | Đọc diff, giữ hoặc hoàn tác từng file | 5–15 phút |
| 5 | Chạy lint, typecheck, test, chạy thử | 5 phút |
| 6 | Hiểu code: chạy `/r2-explain-defense` cho phần khó | 5–10 phút |
| 7 | Ghi `docs/ai-usage-log.md` và commit | 2 phút |
| 8 | Mở PR, chạy `/r1-review`, merge | 5–10 phút |

### Bước 1 – Tạo nhánh

Một nhánh cho mỗi lệnh (hoặc mỗi cặp A+B):

```bash
git switch main && git pull
git switch -c feat/p05-transactions
```

Quy ước tên: `feat/pXX-<tên>` cho tính năng, `docs/adr-<tên>` cho bước quyết định, `fix/<tên>` khi sửa lỗi.

### Bước 2 – Phiên chat mới, đúng chế độ, đúng model

- **Luôn mở phiên mới** cho mỗi lệnh (Copilot: nút **+ New Chat**; Claude Code: `/clear` hoặc mở hội thoại mới). Phiên cũ dài làm AI nhầm ngữ cảnh và tốn phí.
- **Chế độ:** lệnh đã khai báo sẵn (`agent` cho hầu hết lệnh, `ask` cho `/r1-review` và `/r2-explain-defense`). Với lệnh `-decide` trong Claude Code, bật thêm **Plan mode** để chắc chắn không sửa code.
- **Model:** nếu chưa điền `tiers.json` cho Copilot, nhìn biểu tượng ở mô tả lệnh và tự chọn: 🟢 model nhỏ/nhanh, 🔵 model tầm trung, 🔴 model mạnh nhất bạn có.

### Bước 3 – Chạy lệnh

Gõ `/` + tên lệnh, Enter. Ví dụ `/p1-2-dev-docker`.

- Lệnh tự đưa vào ngữ cảnh các chương tài liệu cần thiết – **không cần đính kèm thêm**.
- Khi AI muốn chạy lệnh terminal (npm install, prisma migrate…), VS Code/Claude Code hỏi xác nhận. **Đọc lệnh trước khi bấm Allow.** Từ chối mọi lệnh xóa dữ liệu (`migrate reset`, `DROP`, `rm -rf`) nếu bạn không chủ động yêu cầu.
- Nếu AI dừng lại hỏi (ví dụ vì tài liệu mâu thuẫn), trả lời trong cùng phiên.

### Bước 4 – Đọc diff

- **Copilot:** mỗi file thay đổi hiện trong danh sách *Changed files* với nút **Keep / Undo**; mở từng file để xem diff inline. Có thể quay lại trạng thái trước bằng checkpoint của phiên chat.
- **Claude Code:** xem diff trong editor khi AI đề xuất sửa; chấp nhận hoặc từ chối từng thay đổi. Chế độ tự động chấp nhận chỉ nên bật cho lệnh 🟢.
- Song song, dùng tab **Source Control** (`Ctrl+Shift+G`) để thấy toàn bộ thay đổi so với commit trước.

Những dấu hiệu phải dừng và sửa: AI sửa file ngoài phạm vi nhiệm vụ; bỏ điều kiện `userId`; dùng `number` cho tiền; viết chuỗi giao diện không nằm trong `en.ts`; thêm thư viện lạ không có trong stack.

### Bước 5 – Chạy kiểm tra

```bash
npm run lint && npm run typecheck && npm test
```

Và chạy thử bằng tay (`npm run dev`) đúng tính năng vừa làm. Lỗi thì dùng `/r3-debug` (xem mục 7).

### Bước 6 – Hiểu code trước khi commit

SRS cấm nộp code AI sinh ra mà không hiểu, và giám khảo sẽ hỏi. Với phần khó, chạy:

```text
/r2-explain-defense api/src/modules/auth
```

Đọc kỹ 8 câu hỏi giám khảo có thể hỏi. Nếu bạn không tự trả lời được câu nào, sửa code theo cách bạn hiểu hoặc hỏi tiếp trong phiên đó.

### Bước 7 – Ghi nhật ký AI và commit

Cuối mỗi lệnh, AI in sẵn **một dòng đề xuất cho `docs/ai-usage-log.md`**. Kiểm tra, sửa cột *"Đội đã chỉnh sửa gì"* cho đúng thực tế, dán vào bảng.

```bash
git add .
git commit -m "feat(transactions): CRUD with history and optimistic locking (p5-1b)"
```

Quy ước commit: Conventional Commits, ghi tên lệnh trong ngoặc cuối để truy vết.

### Bước 8 – Pull Request và review

```bash
git push -u origin feat/p05-transactions
```

Mở PR trên GitHub – template checklist hiện sẵn. Trong VS Code, chạy:

```text
/r1-review feat/p05-transactions
```

Sửa hết mục **"Phải sửa"**, đánh dấu checklist, nhờ một thành viên khác duyệt rồi merge.

---

## 6. Quy trình hai bước A → B (quyết định rồi thi công)

Bảy chỗ rủi ro cao có cặp lệnh `-decide` (🔴) và `-build` (🔵):

| Bước A (🔴 quyết định) | Sinh ra | Bước B (🔵 thi công) |
|---|---|---|
| `/p2-1a-db-schema-decide` | `docs/decisions/ADR-DB-01.md` | `/p2-1b-db-schema-build` |
| `/p3-1a-auth-decide` | `ADR-AUTH-01.md` | `/p3-1b-auth-build` |
| `/p5-1a-transactions-decide` | `ADR-TX-01.md` | `/p5-1b-transactions-build` |
| `/p8-3a-pdf-decide` | `ADR-PDF-01.md` | `/p8-3b-pdf-build` |
| `/p9-1a-ai-decide` | `ADR-AI-01.md` | `/p9-1b-ai-build` |
| `/p11-1a-insights-decide` | `ADR-INSIGHT-01.md` | `/p11-1b-insights-build` |
| `/p14-2a-admin-decide` | `ADR-ADMIN-01.md` | `/p14-2b-admin-build` |

**Thao tác cụ thể:**

1. Nhánh `docs/adr-db`. Phiên mới, model 🔴, chạy `/p2-1a-db-schema-decide`.
2. AI chỉ tạo `docs/decisions/ADR-DB-01.md` với trạng thái `Proposed` (lệnh đã cấm sửa code).
3. **Cả đội đọc ADR** (15–30 phút). Sửa trực tiếp những chỗ không đồng ý; ghi vào mục *"Đội đã chỉnh sửa gì so với bản nháp AI"* ở cuối file.
4. Đổi dòng trạng thái thành `Accepted`, cập nhật bảng trong `docs/decisions/README.md`, commit, merge.
5. Nhánh mới `feat/p02-db-schema`. Phiên mới, model 🔵, chạy `/p2-1b-db-schema-build`. Lệnh tự đọc ADR; nếu ADR chưa `Accepted`, AI sẽ dừng và nhắc bạn.

Lợi ích: mô hình đắt chỉ chạy một lần cho mỗi quyết định; mọi lần thi công sau đọc lại ADR. ADR cũng là tài liệu rất tốt để trình bày "design decisions" trước giám khảo.

---

## 7. Lệnh cần dữ liệu đầu vào

Một số lệnh cần bạn cung cấp thêm thông tin:

| Lệnh | Truyền gì | Copilot | Claude Code |
|---|---|---|---|
| `/r1-review` | Tên nhánh hoặc diff | Hiện ô nhập, gõ `feat/p05-transactions` | `/r1-review feat/p05-transactions` |
| `/r2-explain-defense` | Đường dẫn module/file | Ô nhập: `api/src/modules/ai` | `/r2-explain-defense api/src/modules/ai` |
| `/r3-debug` | Hiện tượng, kỳ vọng, log | Ô nhập: dán mô tả + log | Gõ lệnh rồi dán mô tả + log |
| `/r4-write-tests` | File hoặc hàm | Mở file, chọn đoạn code rồi chạy lệnh; gõ đường dẫn vào ô nhập | `/r4-write-tests api/src/lib/stats.ts` |
| `/r5-optimize-query` | Câu SQL + kết quả EXPLAIN | Ô nhập: dán | Gõ lệnh rồi dán |
| `/p16-4-security-fix` | Các dòng lỗi đã đồng ý sửa | Ô nhập: dán | Gõ lệnh rồi dán |

**Mẹo:** với nội dung dài (log, bảng), dán vào một file tạm như `tmp/bug.md` rồi truyền đường dẫn – gọn hơn dán thẳng vào ô nhập. Nhớ thêm `tmp/` vào `.gitignore`.

---

## 8. Lịch chạy lệnh theo sprint

| Ngày | Lệnh (theo thứ tự) | Ai làm |
|---|---|---|
| **Sprint 1** | | |
| N1 | `/p1-1-init-monorepo` → `/p1-2-dev-docker` → `/p1-3-env-config` | 1 người, cả đội review |
| N1–2 | `/p1-4-express-skeleton` | Backend |
| N2 | `/p2-1a-db-schema-decide` → họp duyệt ADR → `/p2-1b-db-schema-build` → `/p2-2-db-seed` | Backend + cả đội duyệt ADR |
| N3 | `/p3-1a-auth-decide` → duyệt → `/p3-1b-auth-build` | Backend |
| N3–4 | `/p3-2-profile-sessions`, `/p3-3-web-auth` | Backend / Frontend song song |
| N4–5 | `/p4-1-categories`, `/p15-1-design-system` | Fullstack / Frontend |
| **Sprint 2** | | |
| N6 | `/p5-1a-transactions-decide` → duyệt → `/p5-1b-transactions-build` | Backend |
| N6–7 | `/p5-2-web-transactions` | Frontend |
| N7–8 | `/p6-1-recurring-cron`, `/p7-1-budgets-alerts` | Fullstack |
| N8–10 | `/p8-1-analytics-api` → `/p8-2-web-dashboard-reports` | Backend → Frontend |
| **Sprint 3** | | |
| N11 | `/p8-3a-pdf-decide` → `/p8-3b-pdf-build` | Fullstack |
| N11–12 | `/p9-1a-ai-decide` → `/p9-1b-ai-build` → `/p9-2-web-ai-chip` | AI owner |
| N12–13 | `/p10-1-csv-import` | Fullstack |
| N13–14 | `/p11-1a-insights-decide` → `/p11-1b-insights-build`, `/p12-1-tips-engine` | AI owner / Backend |
| **Sprint 4** | | |
| N15 | `/p13-1-system-intelligence`, `/p14-1-bookmarks` | Backend / Frontend |
| N15–16 | `/p14-2a-admin-decide` → `/p14-2b-admin-build` | Fullstack |
| N16 | `/p15-2-landing-sitemap-chatbot`, `/p15-3-a11y-audit` | Frontend |
| N17 | `/p16-1-test-suite`, `/p16-2-manual-test-scenarios` | Cả đội |
| N17–18 | `/p16-3-security-audit` → họp chọn lỗi → `/p16-4-security-fix` | Người vững bảo mật nhất |
| N18–19 | `/p17-1-docker-prod` → `/p17-2-github-actions` → `/p17-3-vps-checklist` | DevOps |
| N19–20 | `/p18-1-demo-seed` → `/p18-2-readme` → `/p18-3-video-script` → `/p18-4-ai-declaration` | Cả đội |

Các lệnh `/r1` → `/r5` dùng bất cứ lúc nào.

---

## 9. Làm việc nhóm không giẫm chân nhau

- **Chia theo tính năng dọc** (một người làm trọn từ DB đến UI một tính năng), không chia cứng FE/BE. Ai làm phần nào sẽ bảo vệ phần đó trước giám khảo.
- **File dùng chung** dễ xung đột: `api/prisma/schema.prisma`, `web/src/content/en.ts`, `api/src/app.ts` (đăng ký route), `packages/shared`. Quy ước: chỉ **một** người đổi `schema.prisma` mỗi lúc; báo trên nhóm chat trước khi tạo migration mới; luôn `git pull --rebase` trước khi tạo migration.
- **Migration xung đột** (hai người cùng tạo migration): người merge sau xóa migration của mình, pull, chạy lại `prisma migrate dev --create-only`, chép lại phần SQL viết tay (CHECK constraint) vào file mới.
- **Không sửa file sinh tự động** (`.github/prompts/*`, `.claude/commands/*`, `.github/copilot-instructions.md`). Muốn đổi thì sửa nguồn (mục 10).

---

## 10. Tùy biến kit

### 10.1 Sửa quy tắc chung

Sửa `AGENTS.md` → chạy `npm run prompts:build` (để cập nhật `copilot-instructions.md`) → commit cả hai.

### 10.2 Sửa một lệnh

1. Mở `tools/prompt-kit/prompts.source.json`, tìm theo `"id": "P5.1-B"` hoặc `"name"`.
2. Sửa trường `body` (nội dung nhiệm vụ), `refs` (chương tài liệu đính kèm), `tier`/`why` (cấp AI và lý do).
3. `npm run prompts:build`, kiểm tra file sinh ra trong `.github/prompts/` và `.claude/commands/campus/`, commit.

### 10.3 Thêm một lệnh mới

Thêm một object vào mảng trong `prompts.source.json`, đủ các trường như các lệnh khác: `id`, `name` (dạng `p19-1-ten-lenh`), `title`, `tier` (🟢/🔵/🔴), `tierName`, `why` (lý do chọn cấp), `refs` (ví dụ `[["design","07-thiet-ke-api.md"]]`), `attachNotes`, `inputs`, `body`, `adr` (hoặc `null`), `mode` (`agent`/`ask`). Chạy build.

### 10.4 Khi tài liệu thiết kế thay đổi

Sửa file Word trước (đó là bản nộp), sau đó cập nhật chương tương ứng trong `docs/design/`. Hai bản phải khớp nhau.

---

## 11. Xử lý sự cố

| Hiện tượng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| Gõ `/` trong Copilot không thấy lệnh `p…` | Mở sai thư mục gốc; prompt files bị tắt; VS Code cũ | Mở đúng thư mục chứa `.github/`; kiểm tra `.vscode/settings.json` được áp dụng (Settings → tìm `prompt files`); cập nhật VS Code; Command Palette → `Developer: Reload Window` |
| VS Code gạch vàng một dòng trong `settings.json` | Tên setting đã đổi ở phiên bản mới | Bỏ qua dòng đó – các tính năng tương ứng thường đã bật mặc định |
| Lệnh Copilot báo không tìm thấy model | Tên model trong `tiers.json` không khớp picker | Chép lại đúng nguyên văn tên trong picker, hoặc để trống, rồi `npm run prompts:build` |
| Claude Code không thấy lệnh | Thư mục `.claude` không nằm ở gốc workspace | Kiểm tra `ls -la .claude/commands/campus`; mở lại panel Claude Code |
| AI không tuân theo `AGENTS.md` | Phiên chat quá dài, ngữ cảnh bị cắt | Mở phiên mới; nhắc "đọc lại AGENTS.md mục 1" |
| AI "bịa" yêu cầu không có trong tài liệu | Không đọc chương được trỏ tới | Hỏi "trích dẫn số mục tài liệu cho yêu cầu này"; nếu không có, bỏ phần đó |
| Lệnh `-build` dừng vì thiếu ADR | Chưa chạy bước A hoặc ADR còn `Proposed` | Làm đúng quy trình mục 6 |
| AI sửa lan sang nhiều file không liên quan | Nhiệm vụ mơ hồ hoặc dùng model 🟢 cho việc 🔵 | Undo, chạy lại với model đúng cấp; thêm câu "chỉ sửa trong thư mục …" |
| Hết hạn mức sử dụng model đắt | Chạy 🔴 cho việc không cần | Chỉ dùng 🔴 cho `-decide`, `/p16-3`, `/r2`, `/r5` |
| Chuỗi giao diện tiếng Việt lọt vào UI | AI lấy ví dụ từ tài liệu thiết kế tiếng Việt | Chạy lại với câu "mọi chuỗi UI bằng tiếng Anh trong src/content/en.ts theo AGENTS.md" |

---

## 12. Checklist trước khi nộp bài

- [ ] Mọi ADR ở trạng thái `Accepted`, bảng `docs/decisions/README.md` cập nhật.
- [ ] `docs/ai-usage-log.md` đầy đủ; đã chạy `/p18-4-ai-declaration` và chép kết quả vào Phụ lục D của file Word.
- [ ] `database/campus_coin_schema.sql` có đủ CHECK constraint (kiểm tra bằng `SHOW CREATE TABLE`), kèm `seed.sql`.
- [ ] README và ReadMe.doc có hướng dẫn cài đặt + tài khoản mọi loại người dùng (SRS bắt buộc).
- [ ] Video `.mp4` quay theo kịch bản `/p18-3-video-script`, đã đánh dấu đủ checklist yêu cầu SRS.
- [ ] Bản trực tuyến chạy được, URL ghi trong README và tài liệu.
- [ ] Mỗi thành viên đã chạy `/r2-explain-defense` cho phần mình làm và trả lời được các câu hỏi khó.
- [ ] Gói zip nộp **không** chứa `.env`, `node_modules`, khóa bí mật. Cân nhắc giữ `AGENTS.md`, `docs/decisions/` và `docs/ai-usage-log.md` trong gói nộp như minh chứng dùng AI minh bạch.

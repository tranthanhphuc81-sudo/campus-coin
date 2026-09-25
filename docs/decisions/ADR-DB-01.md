# ADR-DB-01: Thiáº¿t káº¿ schema Prisma cho MySQL

- **Tráº¡ng thÃ¡i:** Accepted
- **NgÃ y:** 2026-09-25
- **NgÆ°á»i quyáº¿t Ä‘á»‹nh:** _(Ä‘á»™i xÃ¡c nháº­n trÆ°á»›c khi chuyá»ƒn Accepted)_
- **Prompt táº¡o báº£n nhÃ¡p:** p2-1a-db-schema-decide, GitHub Copilot (Claude Sonnet 5)

## Bá»‘i cáº£nh

ChÆ°Æ¡ng 6 (`docs/design/06-thiet-ke-co-so-du-lieu.md`) Ä‘Ã£ chá»‘t tá»« Ä‘iá»ƒn dá»¯ liá»‡u cho 18 báº£ng MySQL 8.4 nhÆ°ng chÆ°a quyáº¿t Ä‘á»‹nh cÃ¡ch biá»ƒu diá»…n má»™t sá»‘ rÃ ng buá»™c trong Prisma â€“ cÃ´ng cá»¥ khÃ´ng há»— trá»£ trá»±c tiáº¿p CHECK constraint, cá»™t sinh (generated column), hay UUID v7. ADR nÃ y chá»‘t cÃ¡ch Ã¡nh xáº¡, khÃ´ng thay Ä‘á»•i tá»« Ä‘iá»ƒn dá»¯ liá»‡u Ä‘Ã£ cÃ³ trá»« khi nÃªu rÃµ lÃ  sai lá»‡ch cáº§n Ä‘á»™i xÃ¡c nháº­n.

PhiÃªn báº£n cÃ´ng cá»¥ táº¡i thá»i Ä‘iá»ƒm viáº¿t: `prisma` `^8.0.0-rc.17`, `@prisma/client` `^7.10.0` (xem `package.json`). ÄÃ£ xÃ¡c minh vá»›i tÃ i liá»‡u Prisma ORM v7 chÃ­nh thá»©c (mapping/constraints) vÃ  issue theo dÃµi CHECK constraint (prisma/orm#3388, cÃ²n má»Ÿ, gáº¯n nhÃ£n "status/has-stopgap" â€“ tá»©c chá»‰ cÃ³ cÃ¡ch nÃ© táº¡m, chÆ°a cÃ³ cÃº phÃ¡p khai bÃ¡o trá»±c tiáº¿p). VÃ¬ `prisma` Ä‘ang á»Ÿ báº£n release-candidate (8.0.0-rc), Ä‘á»™i cáº§n xÃ¡c nháº­n láº¡i cÃ¡c Ä‘iá»ƒm nÃ y khi báº£n chÃ­nh thá»©c phÃ¡t hÃ nh, phÃ²ng trÆ°á»ng há»£p cÃ³ thay Ä‘á»•i.

## CÃ¡c quyáº¿t Ä‘á»‹nh

### 1. Sinh UUID v7 (CHAR(36)): á»©ng dá»¥ng hay DB?

| PhÆ°Æ¡ng Ã¡n | Æ¯u Ä‘iá»ƒm | NhÆ°á»£c Ä‘iá»ƒm |
|---|---|---|
| A. Sinh trong MySQL (trigger/hÃ m tá»± viáº¿t) | ID luÃ´n Ä‘Æ°á»£c sinh dÃ¹ insert báº±ng Ä‘Æ°á»ng nÃ o (ká»ƒ cáº£ raw SQL) | MySQL 8.4 khÃ´ng cÃ³ hÃ m `UUID_v7()` dá»±ng sáºµn; pháº£i tá»± viáº¿t hÃ m/trigger ghÃ©p timestamp+random, khÃ³ Ä‘áº£m báº£o Ä‘Ãºng bit-layout vÃ  tÃ­nh Ä‘Æ¡n Ä‘iá»‡u; Prisma khÃ´ng biá»ƒu diá»…n Ä‘Æ°á»£c `DEFAULT` lÃ  káº¿t quáº£ hÃ m tá»± viáº¿t â†’ váº«n pháº£i viáº¿t tay migration, migrate tÆ°Æ¡ng lai dá»… ghi Ä‘Ã¨ |
| B. Sinh á»Ÿ táº§ng á»©ng dá»¥ng báº±ng thÆ° viá»‡n | Kiá»ƒm soÃ¡t vÃ  test Ä‘Æ°á»£c thuáº­t toÃ¡n, khÃ´ng phá»¥ thuá»™c phiÃªn báº£n DB, hoáº¡t Ä‘á»™ng Ä‘á»“ng nháº¥t giá»¯a API/seed/test | Pháº£i Ä‘áº£m báº£o má»i Ä‘Æ°á»ng ghi (repository, seed) Ä‘á»u gá»i hÃ m sinh ID; cáº§n thÃªm 1 dependency má»›i |
| C. DÃ¹ng `@default(uuid())` cÃ³ sáºµn cá»§a Prisma | KhÃ´ng cáº§n thÃªm thÆ° viá»‡n | ÄÃ¢y lÃ  UUID v4 (ngáº«u nhiÃªn hoÃ n toÃ n), sai yÃªu cáº§u thiáº¿t káº¿ (cáº§n v7 tÄƒng dáº§n theo thá»i gian Ä‘á»ƒ tá»‘i Æ°u chá»‰ má»¥c B-Tree) â†’ loáº¡i |

**Chá»‘t:** B â€“ Sinh UUID v7 á»Ÿ táº§ng á»©ng dá»¥ng, dÃ¹ng gÃ³i `uuidv7` (nhá», khÃ´ng phá»¥ thuá»™c, chuyÃªn biá»‡t cho v7). Trong `schema.prisma`, khai bÃ¡o khÃ³a chÃ­nh lÃ  cá»™t thÆ°á»ng, KHÃ”NG dÃ¹ng `@default(...)`:

```prisma
model User {
  id String @id @db.Char(36)
  // ...
}
```

Äá»ƒ trÃ¡nh viá»‡c tá»«ng repository pháº£i nhá»› gá»i `generateId()` thá»§ cÃ´ng, thÃªm má»™t Prisma Client Extension (`$extends`) táº¡i `api/src/lib/prisma.ts` cháº·n hook `query` cho cÃ¡c model cÃ³ PK UUID v7 (users, transactions, import_batches, refresh_tokens) vÃ  tá»± Ä‘iá»n `id` náº¿u payload `create` chÆ°a cÃ³. HÃ m `generateId()` Ä‘áº·t táº¡i `packages/shared` Ä‘á»ƒ cáº£ API vÃ  seed script dÃ¹ng chung. **LÃ½ do:** Ä‘Æ¡n giáº£n, khÃ´ng phá»¥ thuá»™c phiÃªn báº£n MySQL, dá»… test, vÃ  táº­p trung logic sinh ID á»Ÿ má»™t chá»— nÃªn rá»§i ro quÃªn gá»i gáº§n nhÆ° khÃ´ng cÃ²n.

### 2. UNIQUE(owner_key, type, name) cho categories khi owner_key lÃ  cá»™t sinh

| PhÆ°Æ¡ng Ã¡n | Æ¯u Ä‘iá»ƒm | NhÆ°á»£c Ä‘iá»ƒm |
|---|---|---|
| A. Giá»¯ cá»™t sinh (GENERATED ALWAYS AS ... STORED) viáº¿t tay trong migration, khai bÃ¡o trong Prisma báº±ng `Unsupported("<toÃ n bá»™ chuá»—i DDL cá»™t>")` | ÄÃºng nguyÃªn vÄƒn thiáº¿t káº¿ chÆ°Æ¡ng 6; DB tá»± Ä‘áº£m báº£o toÃ n váº¹n tuyá»‡t Ä‘á»‘i | Prisma khÃ´ng há»— trá»£ generated column chÃ­nh thá»©c (chá»‰ cÃ³ cÃ¡ch nÃ© báº±ng `Unsupported`); rá»§i ro cao lÃ  láº§n `prisma migrate dev` sau sáº½ phÃ¡t hiá»‡n lá»‡ch (drift) giá»¯a chuá»—i kiá»ƒu khai bÃ¡o vÃ  DDL thá»±c táº¿ rá»“i cá»‘ "sá»­a" láº¡i; khÃ´ng thá»ƒ Ä‘Æ°a cá»™t `Unsupported` vÃ o `@@unique` má»™t cÃ¡ch cháº¯c cháº¯n á»Ÿ má»i phiÃªn báº£n â€“ cáº§n Ä‘á»™i tá»± kiá»ƒm chá»©ng báº±ng `prisma migrate diff`, rá»§i ro cho má»™t API thi cÃ´ng tá»± Ä‘á»™ng |
| B. Bá» cá»™t sinh, chá»‰ dÃ¹ng `@@unique([userId, type, name])`, kiá»ƒm tra trÃ¹ng cho danh má»¥c há»‡ thá»‘ng (`userId = NULL`) á»Ÿ service | Prisma-native hoÃ n toÃ n, khÃ´ng rá»§i ro drift | MySQL coi má»—i NULL lÃ  khÃ¡c nhau trong unique index â†’ hÃ ng danh má»¥c máº·c Ä‘á»‹nh (`userId = NULL`) **khÃ´ng** Ä‘Æ°á»£c DB báº£o vá»‡ khá»i trÃ¹ng láº·p; toÃ n bá»™ trÃ¡ch nhiá»‡m dá»“n vá» service, dá»… cÃ³ race condition náº¿u khÃ´ng khÃ³a giao dá»‹ch cáº©n tháº­n |
| C. Giá»¯ cá»™t `owner_key` nhÆ°ng KHÃ”NG sinh báº±ng DB â€“ á»©ng dá»¥ng tá»± tÃ­nh vÃ  ghi giÃ¡ trá»‹ (`userId ?? 'SYSTEM'`) nhÆ° má»™t cá»™t thÆ°á»ng | CÃ³ Ä‘Æ°á»£c rÃ ng buá»™c DB-level Ä‘áº§y Ä‘á»§ nhÆ° thiáº¿t káº¿ mong muá»‘n (ká»ƒ cáº£ cho danh má»¥c há»‡ thá»‘ng) mÃ  hoÃ n toÃ n Prisma-native, khÃ´ng cÃ³ rá»§i ro drift; `@@unique([ownerKey, type, name])` khai bÃ¡o bÃ¬nh thÆ°á»ng | Cá»™t `owner_key` khÃ´ng cÃ²n "tá»± Ä‘á»™ng Ä‘á»“ng bá»™" vá»›i `user_id` á»Ÿ táº§ng DB â€“ phá»¥ thuá»™c á»©ng dá»¥ng luÃ´n set Ä‘Ãºng khi táº¡o; tuy nhiÃªn `userId` cá»§a má»™t category khÃ´ng bao giá» Ä‘á»•i sau khi táº¡o (báº¥t biáº¿n theo nghiá»‡p vá»¥) nÃªn rá»§i ro lá»‡ch dá»¯ liá»‡u gáº§n nhÆ° báº±ng 0 |

**Chá»‘t:** C â€“ Giá»¯ tÃªn cá»™t `owner_key` (Ä‘Ãºng nhÆ° tÃ i liá»‡u) nhÆ°ng chuyá»ƒn thÃ nh cá»™t do á»©ng dá»¥ng ghi (khÃ´ng pháº£i `GENERATED`):

```prisma
model Category {
  id       Int    @id @default(autoincrement())
  userId   String? @db.Char(36)
  ownerKey String  @db.VarChar(36) // = userId ?? 'SYSTEM', do á»©ng dá»¥ng tÃ­nh khi táº¡o, KHÃ”NG cáº­p nháº­t sau Ä‘Ã³
  name     String  @db.VarChar(50)
  type     CategoryType

  @@unique([ownerKey, type, name])
}
```

Viá»‡c tÃ­nh `ownerKey` Ä‘áº·t trong cÃ¹ng Prisma Client Extension á»Ÿ má»¥c 1 (hook `create` cho model `Category`), khÃ´ng láº·p láº¡i á»Ÿ tá»«ng service. **LÃ½ do:** Ä‘áº¡t Ä‘Æ°á»£c Ä‘Ãºng má»¥c tiÃªu nghiá»‡p vá»¥ (cháº·n trÃ¹ng tÃªn ká»ƒ cáº£ danh má»¥c há»‡ thá»‘ng) báº±ng cÆ¡ cháº¿ Prisma há»— trá»£ Ä‘áº§y Ä‘á»§, trÃ¡nh hoÃ n toÃ n rá»§i ro "migrate cá»‘ xÃ³a cá»™t sinh" mÃ  Ä‘á» bÃ i lo ngáº¡i â€“ Ä‘Ã¢y lÃ  phÆ°Æ¡ng Ã¡n (c) "khÃ¡c" so vá»›i 2 gá»£i Ã½ ban Ä‘áº§u.

### 3. CHECK constraint pháº£i viáº¿t tay trong migration

Prisma (Ä‘Ã£ xÃ¡c minh vá»›i Prisma ORM v7 chÃ­nh thá»©c vÃ  issue prisma/orm#3388 â€“ váº«n má»Ÿ, chÆ°a cÃ³ cÃº phÃ¡p `@@check`) khÃ´ng cÃ³ cÃ¡ch khai bÃ¡o CHECK constraint trong `schema.prisma`. Quy trÃ¬nh báº¯t buá»™c: `prisma migrate dev --create-only` rá»“i sá»­a tay file `migration.sql` Ä‘á»ƒ thÃªm `ALTER TABLE ... ADD CONSTRAINT ... CHECK (...)`.

**Danh sÃ¡ch Ä‘áº§y Ä‘á»§ pháº£i viáº¿t tay (8 CHECK nÃªu tháº³ng trong tá»« Ä‘iá»ƒn dá»¯ liá»‡u chÆ°Æ¡ng 6 + 7 CHECK suy ra tá»« ngá»¯ nghÄ©a cá»™t, Ä‘Ã£ CHá»T Ä‘Æ°a vÃ o báº¯t buá»™c theo yÃªu cáº§u Ä‘á»™i):**

| # | Báº£ng | CHECK | Nguá»“n |
|---|---|---|---|
| 1 | users | `monthly_allowance_baseline IS NULL OR monthly_allowance_baseline >= 0` | NÃªu tháº³ng trong chÆ°Æ¡ng 6 |
| 2 | users | `monthly_savings_goal IS NULL OR monthly_savings_goal >= 0` | NÃªu tháº³ng trong chÆ°Æ¡ng 6 |
| 3 | transactions | `amount > 0` | NÃªu tháº³ng trong chÆ°Æ¡ng 6 |
| 4 | recurring_rules | `amount > 0` | NÃªu tháº³ng trong chÆ°Æ¡ng 6 |
| 5 | recurring_rules | `interval_count BETWEEN 1 AND 12` | NÃªu tháº³ng trong chÆ°Æ¡ng 6 |
| 6 | budgets | `limit_amount > 0` | NÃªu tháº³ng trong chÆ°Æ¡ng 6 |
| 7 | budgets | `alert_threshold_pct BETWEEN 50 AND 100` | NÃªu tháº³ng trong chÆ°Æ¡ng 6 |
| 8 | insights | `regenerate_count BETWEEN 0 AND 3` | NÃªu tháº³ng trong chÆ°Æ¡ng 6 |
| 9 | transactions | `ai_confidence IS NULL OR ai_confidence BETWEEN 0 AND 1` | Suy ra: cá»™t mÃ´ táº£ "Ä‘á»™ tin cáº­y 0â€“1" |
| 10 | recurring_rules | `day_of_month IS NULL OR day_of_month BETWEEN 1 AND 31` | Suy ra: ngÃ y trong thÃ¡ng há»£p lá»‡ |
| 11 | recurring_rules | `day_of_week IS NULL OR day_of_week BETWEEN 0 AND 6` | Suy ra: thá»© trong tuáº§n (0=CNâ€¦6=T7) |
| 12 | recurring_rules | `end_date IS NULL OR end_date >= start_date` | Suy ra: toÃ n váº¹n khoáº£ng hiá»‡u lá»±c |
| 13 | budgets | `DAY(month) = 1` | Suy ra: "month luÃ´n lÃ  ngÃ y Ä‘áº§u thÃ¡ng" (má»¥c 6.1) |
| 14 | insights | `DAY(month) = 1` | Suy ra: cÃ¹ng lÃ½ do |
| 15 | user_tips | `DAY(period) = 1` | Suy ra: cÃ¹ng lÃ½ do |

**Chá»‘t:** Viáº¿t tay Ä‘á»§ 15 CHECK á»Ÿ trÃªn trong migration.sql. Vá»›i cÃ¡c CHECK #9â€“15 (suy ra, khÃ´ng cÃ³ cÃ¢u chá»¯ tÆ°á»ng minh trong tá»« Ä‘iá»ƒn dá»¯ liá»‡u gá»‘c) â€“ Ä‘á»™i váº«n cáº§n rÃ  láº¡i má»™t láº§n khi review migration Ä‘á»ƒ cháº¯c cháº¯n khÃ´ng mÃ¢u thuáº«n vá»›i nghiá»‡p vá»¥ thá»±c táº¿ (vd. cÃ³ cho phÃ©p `day_of_week` theo chuáº©n 1â€“7 thay vÃ¬ 0â€“6 hay khÃ´ng).

### 4. Chuáº©n hÃ³a Decimal â†’ chuá»—i "12.50" á»Ÿ táº§ng API

| PhÆ°Æ¡ng Ã¡n | Æ¯u Ä‘iá»ƒm | NhÆ°á»£c Ä‘iá»ƒm |
|---|---|---|
| A. Serializer toÃ n cá»¥c (middleware bá»c `res.json`, tá»± dÃ² `instanceof Prisma.Decimal` vÃ  Ä‘á»‡ quy chuyá»ƒn) | KhÃ´ng thá»ƒ quÃªn; 1 nÆ¡i duy nháº¥t | "Ma thuáº­t" áº©n, khÃ³ kiá»ƒm soÃ¡t Ä‘á»‹nh dáº¡ng riÃªng theo field (vd. `ai_confidence` cÃ³ thá»ƒ cáº§n 3 chá»¯ sá»‘ tháº­p phÃ¢n chá»© khÃ´ng pháº£i 2 nhÆ° tiá»n) |
| B. Má»—i DTO/mapper tá»± gá»i hÃ m Ä‘á»‹nh dáº¡ng khi dá»±ng response | RÃµ rÃ ng, kiá»ƒm soÃ¡t theo tá»«ng field, khá»›p vá»›i quy táº¯c "controller má»ng, nghiá»‡p vá»¥ á»Ÿ service" Ä‘Ã£ cÃ³ (mapper vá»‘n Ä‘Ã£ tá»“n táº¡i) | CÃ³ thá»ƒ quÃªn á»Ÿ má»™t field má»›i, Ä‘á»ƒ lá»t object `Decimal` ra ngoÃ i |
| C. Káº¿t há»£p A + B | Vá»«a rÃµ rÃ ng vá»«a cÃ³ lÆ°á»›i an toÃ n | ThÃªm má»™t lá»›p middleware nhá» |

**Chá»‘t:** C. HÃ m `formatMoney(value: Prisma.Decimal | string | number): string` (lÃ m trÃ²n `toFixed(2)`) Ä‘áº·t táº¡i `packages/shared`, cÃ¡c module tá»± gá»i khi dá»±ng response DTO (nguá»“n sá»± tháº­t, dá»… test theo tá»«ng module). Äá»“ng thá»i thÃªm má»™t lá»›p bá»c `res.json` dÃ¹ng chung trong `api/src/lib` chá»‰ Ä‘á»ƒ **quÃ©t vÃ  log cáº£nh bÃ¡o** (khÃ´ng throw á»Ÿ production) náº¿u phÃ¡t hiá»‡n `instanceof Prisma.Decimal` cÃ²n sÃ³t trong body â€“ lÆ°á»›i an toÃ n phÃ¡t hiá»‡n lá»—i sá»›m, khÃ´ng thay tháº¿ cho viá»‡c mapper pháº£i tá»± Ä‘á»‹nh dáº¡ng Ä‘Ãºng.

### 5. Báº£ng idempotency_keys (chÆ°a cÃ³ trong tá»« Ä‘iá»ƒn dá»¯ liá»‡u)

| Cá»™t | Kiá»ƒu | RÃ ng buá»™c | MÃ´ táº£ |
|---|---|---|---|
| id | BIGINT | PK, AUTO_INCREMENT | |
| user_id | CHAR(36) | FK â†’ users, CASCADE | KhÃ´ng cÃ³ Ã½ nghÄ©a náº¿u tÃ¡ch khá»i ngÆ°á»i dÃ¹ng |
| scope | VARCHAR(60) | NOT NULL | Äá»‹nh danh logic endpoint, vd. `POST /transactions`, `POST /import-batches/commit` |
| idempotency_key | VARCHAR(255) | NOT NULL | GiÃ¡ trá»‹ header client gá»­i |
| request_hash | CHAR(64) | NOT NULL | SHA-256 cá»§a body Ä‘Ã£ chuáº©n hÃ³a â€“ phÃ¡t hiá»‡n dÃ¹ng láº¡i key vá»›i payload khÃ¡c |
| response_status | SMALLINT | NULL | MÃ£ tráº¡ng thÃ¡i HTTP cá»§a láº§n xá»­ lÃ½ gá»‘c, phÃ¡t láº¡i khi trÃ¹ng |
| response_body | JSON | NULL | Ná»™i dung pháº£n há»“i gá»‘c, phÃ¡t láº¡i nguyÃªn vÄƒn |
| locked_at | DATETIME(3) | NULL | ÄÃ¡nh dáº¥u Ä‘ang xá»­ lÃ½ (chÆ°a cÃ³ response) Ä‘á»ƒ cháº·n race condition song song |
| expires_at | DATETIME(3) | NOT NULL | `created_at + 24h` theo má»¥c 7.1 |
| created_at | DATETIME(3) | NOT NULL, DEFAULT now | |
| _(rÃ ng buá»™c)_ | | UNIQUE(user_id, scope, idempotency_key) | Cá»‘t lÃµi cá»§a idempotency |
| _(chá»‰ má»¥c)_ | | INDEX(expires_at) | Phá»¥c vá»¥ job dá»n dáº¹p |

**Luá»“ng xá»­ lÃ½ (service):** (1) náº¿u khÃ´ng cÃ³ header â†’ xá»­ lÃ½ bÃ¬nh thÆ°á»ng; (2) tÃ­nh `request_hash`; (3) tÃ¬m theo `(user_id, scope, key)`: Ä‘Ã£ cÃ³ `response_body` vÃ  hash khá»›p â†’ phÃ¡t láº¡i response gá»‘c, khÃ´ng cháº¡y láº¡i nghiá»‡p vá»¥; Ä‘Ã£ cÃ³ nhÆ°ng hash khÃ¡c â†’ 409 (dÃ¹ng láº¡i key cho payload khÃ¡c); Ä‘Ã£ cÃ³ nhÆ°ng `locked_at` cÃ²n hiá»‡u lá»±c vÃ  chÆ°a cÃ³ response â†’ 409 "Ä‘ang xá»­ lÃ½"; chÆ°a cÃ³ â†’ INSERT hÃ ng "pending" (dá»±a vÃ o UNIQUE Ä‘á»ƒ cháº·n race giá»¯a 2 request Ä‘á»“ng thá»i), cháº¡y nghiá»‡p vá»¥, rá»“i UPDATE `response_status/response_body`, `locked_at = NULL` trong cÃ¹ng transaction vá»›i thao tÃ¡c nghiá»‡p vá»¥ (rollback cÃ¹ng nhau náº¿u lá»—i).

**Dá»n dáº¹p (TTL):** MySQL 8.4 khÃ´ng cÃ³ TTL native cho hÃ ng thÆ°á»ng (khÃ¡c cÃ¡c DB khÃ¡c) â†’ dÃ¹ng `node-cron` (Ä‘Ã£ cÃ³ sáºµn trong stack cho recurring_rules) cháº¡y Ä‘á»‹nh ká»³ (Ä‘á» xuáº¥t má»—i giá») xÃ³a theo lÃ´ nhá» (`DELETE ... WHERE expires_at < NOW() LIMIT 1000` láº·p tá»›i khi háº¿t) Ä‘á»ƒ trÃ¡nh khÃ³a báº£ng lÃ¢u.

### 6. XÃ³a má»m (deleted_at): Prisma Client Extension hay lá»c thá»§ cÃ´ng?

| PhÆ°Æ¡ng Ã¡n | Æ¯u Ä‘iá»ƒm | NhÆ°á»£c Ä‘iá»ƒm |
|---|---|---|
| A. Prisma Client Extension tá»± chÃ¨n `deletedAt: null` vÃ o má»i `where` | KhÃ´ng thá»ƒ quÃªn cho cÃ¡c thao tÃ¡c Ä‘Æ°á»£c bá»c | KhÃ´ng phá»§ háº¿t má»i API (vd. `aggregate`, `groupBy`, `include` lá»“ng quan há»‡ lÃ  giá»›i háº¡n Ä‘Ã£ biáº¿t cá»§a Client Extensions); hÃ nh vi áº©n gÃ¢y khÃ³ hiá»ƒu khi admin cáº§n xem cáº£ báº£n Ä‘Ã£ xÃ³a; gáº¯n cháº·t vÃ o API extension cá»§a Ä‘Ãºng phiÃªn báº£n Prisma Ä‘ang dÃ¹ng |
| B. Lá»c thá»§ cÃ´ng `deletedAt: null` á»Ÿ tá»«ng query trong repository | TÆ°á»ng minh, hoáº¡t Ä‘á»™ng vá»›i Má»ŒI API Prisma (ká»ƒ cáº£ aggregate, raw), dá»… hiá»ƒu khi review | Phá»¥ thuá»™c ká»· luáº­t láº­p trÃ¬nh viÃªn â€“ cÃ³ thá»ƒ quÃªn á»Ÿ query má»›i |

**Chá»‘t:** B, nhÆ°ng giáº£m rá»§i ro "quÃªn lá»c" báº±ng má»™t háº±ng sá»‘ dÃ¹ng chung thay vÃ¬ gÃµ tay `null` má»—i láº§n:

```ts
// api/src/lib/soft-delete.ts
export const notDeleted = { deletedAt: null } as const;
// dÃ¹ng: where: { ...notDeleted, userId }
```

**LÃ½ do chá»n B thay vÃ¬ A:** AGENTS.md Ä‘Ã£ quy Ä‘á»‹nh "truy cáº­p DB á»Ÿ repository; module khÃ´ng gá»i repository cá»§a module khÃ¡c" â€“ nghÄ©a lÃ  má»—i model chá»‰ cÃ³ má»™t vÃ i file repository chá»‹u trÃ¡ch nhiá»‡m duy nháº¥t truy váº¥n nÃ³, nÃªn diá»‡n tÃ­ch rá»§i ro "quÃªn lá»c" Ä‘Ã£ bá»‹ thu háº¹p tá»± nhiÃªn (khÃ¡c vá»›i á»©ng dá»¥ng Ä‘á»ƒ controller/service gá»i Prisma trá»±c tiáº¿p ráº£i rÃ¡c). Vá»›i dá»¯ liá»‡u tÃ i chÃ­nh, tÆ°á»ng minh quan trá»ng hÆ¡n tiá»‡n lá»£i. **Há»‡ quáº£ báº¯t buá»™c:** má»—i repository cá»§a `users` vÃ  `transactions` pháº£i cÃ³ Ã­t nháº¥t 1 test kháº³ng Ä‘á»‹nh báº£n ghi Ä‘Ã£ xÃ³a má»m khÃ´ng xuáº¥t hiá»‡n trong káº¿t quáº£ (Ä‘Æ°a vÃ o checklist Definition of Done).

### 7. MÃºi giá» vÃ  ranh giá»›i "thÃ¡ng hiá»‡n táº¡i"

| PhÆ°Æ¡ng Ã¡n | Æ¯u Ä‘iá»ƒm | NhÆ°á»£c Ä‘iá»ƒm |
|---|---|---|
| A. ThÃªm thÆ° viá»‡n `luxon`/`date-fns-tz` | API tiá»‡n lá»£i cho tÃ­nh toÃ¡n DST | ThÃªm dependency má»›i ngoÃ i stack Ä‘Ã£ chá»‘t trong AGENTS.md â€“ cáº§n há»i Ä‘á»™i trÆ°á»›c khi thÃªm |
| B. DÃ¹ng `Intl.DateTimeFormat` sáºµn cÃ³ cá»§a Node 24 (zero-dependency) | KhÃ´ng thÃªm dependency; Ä‘á»§ dÃ¹ng cho pháº¡m vi háº¹p cáº§n (láº¥y ngÃ y lá»‹ch Ä‘á»‹a phÆ°Æ¡ng "YYYY-MM-DD") | Code tá»± viáº¿t cáº§n test ká»¹, khÃ´ng cÃ³ sáºµn helper cho cÃ¡c phÃ©p toÃ¡n lá»‹ch phá»©c táº¡p hÆ¡n |

**Chá»‘t:** B â€“ khÃ´ng thÃªm dependency má»›i. Viáº¿t helper thuáº§n táº¡i `packages/shared/src/timezone.ts`:

- `getLocalDateString(date: Date, timeZone: string): string` â€“ dÃ¹ng `new Intl.DateTimeFormat('en-CA', { timeZone, year:'numeric', month:'2-digit', day:'2-digit' })` (locale `en-CA` tráº£ sáºµn Ä‘á»‹nh dáº¡ng `YYYY-MM-DD`) Ä‘á»ƒ láº¥y ngÃ y lá»‹ch Ä‘á»‹a phÆ°Æ¡ng cá»§a ngÆ°á»i dÃ¹ng táº¡i má»™t thá»i Ä‘iá»ƒm UTC.
- `getMonthStart(dateStr: string): string` â€“ thao tÃ¡c chuá»—i thuáº§n (Ã©p ngÃ y vá» `01`), khÃ´ng cáº§n Ä‘á»•i mÃºi giá» vÃ¬ Ä‘áº§u vÃ o Ä‘Ã£ lÃ  ngÃ y lá»‹ch Ä‘á»‹a phÆ°Æ¡ng.
- "ThÃ¡ng hiá»‡n táº¡i" cá»§a má»™t ngÆ°á»i dÃ¹ng = `getMonthStart(getLocalDateString(new Date(), user.timezone))`. CÃ¡c job cháº¡y theo lá»‹ch (cáº£nh bÃ¡o ngÃ¢n sÃ¡ch, sinh giao dá»‹ch Ä‘á»‹nh ká»³, insight háº±ng thÃ¡ng) PHáº¢I tÃ­nh theo mÃºi giá» cá»§a **tá»«ng ngÆ°á»i dÃ¹ng**, khÃ´ng dÃ¹ng mÃºi giá» máº·c Ä‘á»‹nh cá»§a server.
- Tiáº¿n trÃ¬nh API/worker cháº¡y vá»›i `TZ=UTC` (khai bÃ¡o trong Docker Compose) Ä‘á»ƒ má»i `new Date()`/`DATETIME(3)` máº·c Ä‘á»‹nh khÃ´ng mÆ¡ há»“; má»i quy Ä‘á»•i sang giá» Ä‘á»‹a phÆ°Æ¡ng pháº£i Ä‘i qua helper nÃ y, khÃ´ng dá»±a vÃ o TZ ngáº§m Ä‘á»‹nh cá»§a host.

### 8. Prisma relationMode vÃ  onDelete theo khÃ³a ngoáº¡i

**relationMode:** Chá»‘t `foreignKeys` (giÃ¡ trá»‹ máº·c Ä‘á»‹nh cá»§a Prisma khi datasource lÃ  MySQL) â€“ dÃ¹ng rÃ ng buá»™c khÃ³a ngoáº¡i tháº­t cá»§a MySQL, KHÃ”NG dÃ¹ng `relationMode = "prisma"` (cháº¿ Ä‘á»™ mÃ´ phá»ng FK á»Ÿ táº§ng á»©ng dá»¥ng, chá»‰ cáº§n thiáº¿t cho cÃ¡c DB khÃ´ng há»— trá»£ FK nhÆ° PlanetScale/vitess Ä‘Ã£ táº¯t FK enforcement â€“ khÃ´ng pháº£i trÆ°á»ng há»£p cá»§a MySQL 8.4 InnoDB).

| Báº£ng.Cá»™t FK | Báº£ng Ä‘Ã­ch | onDelete | LÃ½ do |
|---|---|---|---|
| refresh_tokens.user_id | users | Cascade | ÄÃ£ nÃªu rÃµ trong tá»« Ä‘iá»ƒn dá»¯ liá»‡u |
| auth_tokens.user_id | users | Cascade | ÄÃ£ nÃªu rÃµ trong tá»« Ä‘iá»ƒn dá»¯ liá»‡u |
| categories.user_id | users | Cascade | Danh má»¥c riÃªng cá»§a ngÆ°á»i dÃ¹ng, xÃ³a cÃ¹ng tÃ i khoáº£n khi purge |
| transactions.user_id | users | Restrict | ÄÃ£ nÃªu rÃµ; cháº·n xÃ³a nháº§m user cÃ²n giao dá»‹ch, purge tÃ i khoáº£n pháº£i xÃ³a transactions trÆ°á»›c báº±ng job riÃªng |
| transactions.category_id | categories | Restrict | ÄÃ£ nÃªu rÃµ; khÃ´ng cho xÃ³a category cÃ²n giao dá»‹ch tham chiáº¿u (dÃ¹ng `is_active=false` Ä‘á»ƒ áº©n thay vÃ¬ xÃ³a) |
| transactions.recurring_rule_id | recurring_rules | SetNull | XÃ³a quy táº¯c Ä‘á»‹nh ká»³ khÃ´ng Ä‘Æ°á»£c xÃ³a lÃ¢y cÃ¡c giao dá»‹ch tÃ i chÃ­nh Ä‘Ã£ sinh ra |
| transactions.import_batch_id | import_batches | SetNull | Batch cÃ³ thá»ƒ dá»n dáº¹p mÃ  khÃ´ng áº£nh hÆ°á»Ÿng giao dá»‹ch Ä‘Ã£ commit |
| transactions.ai_suggested_category_id | categories | SetNull | *(Giáº£ Ä‘á»‹nh: tá»« Ä‘iá»ƒn dá»¯ liá»‡u khÃ´ng ghi rÃµ Ä‘Ã¢y lÃ  FK â€“ Ä‘á»™i xÃ¡c nháº­n láº¡i)* |
| transaction_history.transaction_id | _(khÃ´ng FK)_ | â€” | ÄÃ£ nÃªu rÃµ "khÃ´ng FK Ä‘á»ƒ giá»¯ lá»‹ch sá»­" |
| transaction_history.user_id | _(khÃ´ng FK)_ | â€” | Äá»“ng bá»™ vá»›i dÃ²ng trÃªn; áº©n danh hÃ³a khi purge Ä‘Æ°á»£c xá»­ lÃ½ á»Ÿ táº§ng á»©ng dá»¥ng |
| recurring_rules.user_id | users | Restrict | Dá»¯ liá»‡u tÃ i chÃ­nh theo nguyÃªn táº¯c 6.1; purge job xÃ³a tÆ°á»ng minh trÆ°á»›c khi xÃ³a user |
| recurring_rules.category_id | categories | Restrict | KhÃ´ng cho xÃ³a category cÃ²n quy táº¯c Ä‘á»‹nh ká»³ tham chiáº¿u |
| budgets.user_id | users | Restrict | Dá»¯ liá»‡u tÃ i chÃ­nh |
| budgets.category_id | categories | Restrict | KhÃ´ng cho xÃ³a category cÃ²n ngÃ¢n sÃ¡ch tham chiáº¿u |
| insights.user_id | users | Cascade | ÄÃ£ nÃªu rÃµ trong tá»« Ä‘iá»ƒn dá»¯ liá»‡u |
| tip_templates.created_by | users | SetNull | *(Giáº£ Ä‘á»‹nh: cáº§n Ä‘á»•i `created_by` sang NULLable â€“ ná»™i dung máº«u máº¹o lÃ  cáº¥u hÃ¬nh há»‡ thá»‘ng, khÃ´ng nÃªn máº¥t khi admin táº¡o ra nÃ³ bá»‹ xÃ³a, cÅ©ng khÃ´ng nÃªn cháº·n xÃ³a admin vÄ©nh viá»…n)* |
| user_tips.user_id | users | Cascade | ÄÃ£ nÃªu rÃµ trong tá»« Ä‘iá»ƒn dá»¯ liá»‡u |
| user_tips.template_id | tip_templates | SetNull | *(Giáº£ Ä‘á»‹nh: cáº§n `template_id` NULLable)* Ná»™i dung Ä‘Ã£ render sáºµn trong `rendered_title/rendered_body`, khÃ´ng phá»¥ thuá»™c template gá»‘c Ä‘á»ƒ hiá»ƒn thá»‹ lá»‹ch sá»­ |
| notifications.user_id | users | Cascade | Dá»¯ liá»‡u phá»¥ thuá»™c theo nguyÃªn táº¯c 6.1 |
| bookmarks.user_id | users | Cascade | Dá»¯ liá»‡u phá»¥ thuá»™c |
| ai_category_rules.user_id | users | Cascade | Dá»¯ liá»‡u há»c Ä‘Æ°á»£c, ephemeral |
| ai_category_rules.category_id | categories | Cascade | Luáº­t há»c khÃ´ng cÃ²n Ã½ nghÄ©a khi category gá»‘c bá»‹ xÃ³a (chá»‰ xáº£y ra lÃºc purge tÃ i khoáº£n) |
| import_batches.user_id | users | Cascade | Dá»¯ liá»‡u tiá»‡n Ã­ch/audit nháº¹, khÃ´ng pháº£i sá»• cÃ¡i tÃ i chÃ­nh lÃµi |
| recent_activity.user_id | users | Cascade | Nháº­t kÃ½ "xem gáº§n Ä‘Ã¢y", ephemeral (giá»¯ tá»‘i Ä‘a 20 báº£n ghi) |
| recent_activity.transaction_id | transactions | Cascade | Äá»“ng nháº¥t vá»›i `user_id`; vÃ´ nghÄ©a náº¿u giao dá»‹ch gá»‘c Ä‘Ã£ máº¥t |
| announcements.created_by | users | SetNull | *(Giáº£ Ä‘á»‹nh: cáº§n NULLable)* CÃ¹ng lÃ½ do `tip_templates.created_by` |
| audit_logs.actor_id | _(khÃ´ng FK)_ | â€” | Nháº­t kÃ½ kiá»ƒm toÃ¡n pháº£i tá»“n táº¡i Ä‘á»™c láº­p vÃ²ng Ä‘á»i tÃ i khoáº£n (má»¥c 6.6: "giá»¯ audit log Ä‘Ã£ áº©n danh" sau khi purge) |

**LÆ°u Ã½ quan trá»ng:** cÃ¡c FK `Restrict` (transactions, recurring_rules, budgets â† users) cÃ³ nghÄ©a lÃ  **khÃ´ng thá»ƒ** gá»i `prisma.user.delete()` trá»±c tiáº¿p Ä‘á»ƒ purge tÃ i khoáº£n. Viá»‡c purge tÃ i khoáº£n sau 30 ngÃ y Ã¢n háº¡n (má»¥c 6.6) cáº§n má»™t job/service riÃªng xÃ³a tuáº§n tá»± theo Ä‘Ãºng thá»© tá»± phá»¥ thuá»™c (transactions â†’ recurring_rules/budgets/user_tips/... â†’ categories â†’ user) trong má»™t Prisma transaction â€“ **viá»‡c thiáº¿t káº¿ job nÃ y náº±m ngoÃ i pháº¡m vi ADR nÃ y**, chá»‰ ghi nháº­n rÃ ng buá»™c thá»© tá»± táº¡i Ä‘Ã¢y.

## Há»‡ quáº£

- KhÃ´ng táº¡o/sá»­a file code trong ADR nÃ y; cÃ¡c quyáº¿t Ä‘á»‹nh trÃªn Ã¡p dá»¥ng khi thi cÃ´ng á»Ÿ prompt `p2-1b`.
- `packages/shared` sáº½ cáº§n thÃªm: `generateId()` (uuidv7), `formatMoney()`, `timezone.ts` (getLocalDateString/getMonthStart).
- `api/src/lib/prisma.ts` sáº½ cáº§n má»™t Prisma Client Extension cho: tá»± sinh `id` UUID v7, tá»± tÃ­nh `ownerKey` cho Category.
- ThÃªm dependency má»›i: gÃ³i `uuidv7` (cáº§n Ä‘á»™i duyá»‡t vÃ¬ AGENTS.md yÃªu cáº§u há»i trÆ°á»›c khi thÃªm thÆ° viá»‡n ngoÃ i stack cá»‘ Ä‘á»‹nh â€“ tuy nhá» vÃ  khÃ´ng pháº£i "framework lá»›n").
- Loáº¡i trá»«: KHÃ”NG dÃ¹ng cá»™t sinh (`GENERATED ALWAYS AS ... STORED`) cho `owner_key`; KHÃ”NG dÃ¹ng Prisma Client Extension Ä‘á»ƒ tá»± lá»c `deleted_at`; KHÃ”NG thÃªm `luxon`/`date-fns-tz`; KHÃ”NG dÃ¹ng `relationMode = "prisma"`.

## Checklist cho bÆ°á»›c thi cÃ´ng (nhá»¯ng gÃ¬ migration SQL pháº£i viáº¿t tay)

- [ ] Äá»§ 15 CHECK constraint (má»¥c 3, báº£ng #1â€“15) â€“ thÃªm báº±ng `ALTER TABLE ... ADD CONSTRAINT ... CHECK (...)` sau khi cháº¡y `prisma migrate dev --create-only`.
- [ ] KHÃ”NG cáº§n viáº¿t tay SQL cho `owner_key` (theo quyáº¿t Ä‘á»‹nh #2 â€“ cá»™t thÆ°á»ng, Prisma quáº£n lÃ½ Ä‘Æ°á»£c `@@unique`).
- [ ] KHÃ”NG cáº§n viáº¿t tay SQL cho cÃ¡c `onDelete` (Prisma há»— trá»£ `Cascade/Restrict/SetNull` native qua `@relation`).
- [ ] Äá»•i `tip_templates.created_by`, `user_tips.template_id`, `announcements.created_by` sang NULLable Ä‘á»ƒ `SetNull` há»£p lá»‡ â€“ xÃ¡c nháº­n vá»›i Ä‘á»™i vÃ¬ khÃ¡c vá»›i ngá»¥ Ã½ NOT NULL trong tÃ i liá»‡u gá»‘c.
- [ ] XÃ¡c nháº­n `transactions.ai_suggested_category_id` cÃ³ pháº£i FK â†’ categories hay chá»‰ lÃ  cá»™t tham chiáº¿u lá»ng (tÃ i liá»‡u khÃ´ng ghi rÃµ).
- [ ] Báº£ng `idempotency_keys` (má»¥c 5) â€“ cÃ³ thá»ƒ Ä‘á»ƒ Prisma tá»± sinh migration (khÃ´ng cÃ³ tÃ­nh nÄƒng Ä‘áº·c biá»‡t nÃ o Prisma khÃ´ng há»— trá»£).
- [ ] Thiáº¿t káº¿ job "purge tÃ i khoáº£n" theo Ä‘Ãºng thá»© tá»± phá»¥ thuá»™c FK `Restrict` (nÃªu á»Ÿ má»¥c 8) â€“ viá»‡c nÃ y thuá»™c pháº¡m vi má»™t task/ADR khÃ¡c, chá»‰ cáº§n Ä‘áº£m báº£o khÃ´ng dÃ¹ng `prisma.user.delete()` trá»±c tiáº¿p.

## Äá»™i Ä‘Ã£ chá»‰nh sá»­a gÃ¬ so vá»›i báº£n nhÃ¡p AI

_(Äiá»n khi review â€“ ghi rÃµ Ä‘á»ƒ phá»¥c vá»¥ khai bÃ¡o AI vÃ  báº£o vá»‡ trÆ°á»›c giÃ¡m kháº£o.)_



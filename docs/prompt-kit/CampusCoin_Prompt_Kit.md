# CAMPUS COIN - PROMPT KIT (PUBLIC-SAFE VERSION)

Tai lieu nay la bo khung de ca doi lam viec thong nhat voi tro ly AI trong qua trinh phat trien du an Campus Coin. Ban nay da duoc rut gon de tranh lo thong tin van hanh noi bo, nhung van giu day du chuan chat luong de cac thanh vien lam theo.

## 1) Muc tieu su dung

- Tang toc do thuc hien task ky thuat.
- Giu chat luong qua trinh code review, test, va bao ve giai phap.
- Bao dam moi thay doi deu duoc doi ngu hieu, kiem tra, va chiu trach nhiem.

## 2) Nguyen tac bat buoc

- AI chi la tro ly. Doi ngu quyet dinh cuoi cung.
- Khong commit ma nguoi thuc hien khong hieu.
- Khong de lo secret, token, key, password trong prompt, log, hoac file repo.
- Moi thay doi lon phai duoc test, lint, typecheck truoc khi merge.
- Moi quyet dinh kien truc phai co ghi chep ro rang trong ADR.

## 3) Cach dung prompt kit o muc tong quan

1. Chon dung tai lieu tham chieu truoc khi prompt (SRS, design, ADR lien quan).
2. Mo phien chat moi cho tung nhiem vu de tranh nhieu nguu canh.
3. Yeu cau tro ly AI tra ve:
   - Ke hoach ngan gon truoc khi sua
   - Danh sach file se tao/sua
   - Danh sach test can chay
4. Tu danh gia output: logic, bao mat, quyen truy cap du lieu, va tinh nhat quan voi AGENTS.md.
5. Chay verify local: lint, typecheck, test.
6. Chi commit phan da duoc xac nhan dung pham vi.

## 4) Quy trinh de xuat cho moi task

### Buoc A - Lam ro yeu cau

- Xac dinh pham vi module.
- Xac dinh rui ro nghiep vu (phan quyen, idempotency, lich su du lieu, timezone, cleanup).
- Xac dinh tieu chi hoan thanh.

### Buoc B - Tao thay doi

- Uu tien sua nho, tach theo lop route -> controller -> service -> repository.
- Validate input tai bien API.
- Khong tin du lieu quyen tu client.
- Bao dam query du lieu nguoi dung luon theo userId tu token.

### Buoc C - Kiem tra

- Lint pass.
- Typecheck pass.
- Test pass (success case + rejected case khi co endpoint moi).
- Kiem tra thong diep loi theo Problem Details.

### Buoc D - Ban giao

- Ghi ro gia dinh da dat.
- Ghi ro cac muc can team tu kiem chung.
- De xuat lenh chay lai tren may khac.

## 5) Mau prompt an toan de tai su dung

Ban co the su dung mau sau va dien noi dung task:

"""
Ban dang ho tro du an Campus Coin.
Hay thuc hien nhiem vu sau trong pham vi ro rang:
- Muc tieu:
- Pham vi file:
- Rang buoc nghiep vu:
- Rang buoc bao mat:
- Tieu chi hoan thanh:

Yeu cau phan hoi:
1) Ke hoach ngan gon
2) Thay doi cu the theo file
3) Cach verify (lint/typecheck/test)
4) Danh sach gia dinh va rui ro con lai
"""

## 6) Bao mat va cong khai ma nguon

Khi chuan bi push/public:

- Sanitize tai lieu co dau vet van hanh AI noi bo.
- Giu bo khung quy trinh va tieu chuan chat luong, bo thong tin nhay cam.
- Khong public thong tin nhan su noi bo, log prompt chi tiet, hoac quy trinh van hanh proprietary.

## 7) Dinh nghia hoan thanh (Definition of Done)

Mot task duoc xem la hoan thanh khi:

- Dung voi yeu cau va tai lieu tham chieu.
- Khong vi pham quy tac AGENTS.md.
- Da qua lint/typecheck/test lien quan.
- Co ghi chu ban giao ro rang de thanh vien khac tiep quan duoc.

## 8) Ghi chu

Tai lieu nay la ban public-safe. Neu can tai lieu van hanh day du hon cho nhom noi bo, su dung ban private tach rieng va khong dua len remote cong khai.

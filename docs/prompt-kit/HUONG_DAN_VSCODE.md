# HUONG DAN SU DUNG PROMPT KIT TRONG VS CODE (PUBLIC-SAFE)

Tai lieu nay huong dan nhom su dung prompt kit theo quy trinh thong nhat trong VS Code, phu hop de chia se cong khai ma khong lo chi tiet van hanh AI noi bo.

## 1) Chuan bi moi truong

- Cai VS Code ban moi.
- Cai Node.js theo phien ban du an.
- Cai Git va cau hinh user.name, user.email.
- Cai cac extension can thiet theo file khuyen nghi cua workspace.

## 2) Mo dung workspace

- Mo dung thu muc goc cua repo Campus Coin.
- Dam bao co cac file quy tac du an o thu muc goc (AGENTS.md va tai lieu huong dan lien quan).
- Kiem tra Source Control de chac chan ban dang o nhanh dung.

## 3) Quy trinh chay mot task voi AI

1. Tao nhanh moi cho task.
2. Mo phien chat moi.
3. Neu can, cung cap tai lieu tham chieu theo dung pham vi.
4. Yeu cau AI tra ve ke hoach ngan gon truoc khi sua code.
5. Kiem tra tung thay doi theo file trong editor.
6. Chay lint, typecheck, test truoc commit.
7. Commit theo scope nho, thong diep ro rang.

## 4) Quy tac review trong VS Code

- Luon doc diff truoc khi chap nhan thay doi.
- Tu choi thay doi ngoai pham vi task.
- Kiem tra cac diem nhay cam:
  - Phan quyen theo userId
  - Validate input
  - Khong lo du lieu/secret trong log
  - Dinh dang loi theo chuan API

## 5) Quy trinh commit va push an toan

- Khong dung git add . khi co nhieu thay doi khong lien quan.
- Stage tung file theo muc tieu.
- Kiem tra lai danh sach staged files.
- Push len nhanh rieng, mo Pull Request de review.

## 6) Public-safe checklist truoc khi push

- Khong co file secret (.env, key, token).
- Khong co tai lieu noi bo nhay cam ve van hanh AI.
- Tai lieu huong dan giu muc tong quan, khong ghi chien thuat tac nghiep chi tiet.
- Cac file build tam (nhu tsbuildinfo) da duoc ignore.

## 7) Xu ly su co thuong gap

- Khong thay lenh prompt:
  - Kiem tra mo dung workspace goc.
  - Reload window.
  - Kiem tra extension va settings cua workspace.

- AI de xuat sai huong:
  - Dung lai, tao phien moi.
  - Neu task lon, tach thanh nhieu task nho co tieu chi ro rang.

- Test fail sau thay doi:
  - Kiem tra schema database co dong bo voi code khong.
  - Kiem tra env test va migration.

## 8) Nguyen tac trach nhiem

Moi thanh vien phai co kha nang giai thich phan code minh merge. AI khong thay the trach nhiem ky thuat cua doi phat trien.

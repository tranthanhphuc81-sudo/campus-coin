# ADR-PDF-01: Sinh PDF báo cáo tháng có biểu đồ (server-side, pdfmake)

- **Trạng thái:** Accepted
- **Ngày:** 2026-09-26
- **Người quyết định:** _(đội xác nhận trước khi chuyển Accepted)_
- **Prompt tạo bản nháp:** p8-3a-pdf-decide, GitHub Copilot (Claude Sonnet 5)

## Bối cảnh

Mục 5.8 (`docs/design/05-thiet-ke-chuc-nang.md`) đã chốt tính năng "Xuất PDF" cho báo cáo tháng: server-side, dùng `pdfmake`, font Roboto, nội dung toàn bộ tiếng Anh nhưng phải hiển thị đúng tên/mô tả danh mục và giao dịch có dấu tiếng Việt do người dùng nhập. PDF cần: trang bìa tháng, bảng tổng hợp, biểu đồ (doughnut theo danh mục – bảng 22 dòng "Theo danh mục"; cột nhóm thu vs chi 6 tháng – bảng 22 dòng "Thu vs Chi 6 tháng"), top giao dịch, nhận định tháng (nếu có), ghi chú miễn trừ "Not financial advice".

`pdfmake` tự nó không vẽ được biểu đồ (chart) – chỉ có bảng, văn bản, hình ảnh raster, và (từ bản 0.1.66+) một node `svg` nhúng SVG thô. Vì vậy cần chốt: dữ liệu biểu đồ (đã tổng hợp sẵn ở `analytics` module – xem `getCategoryBreakdownReport`, `getIncomeVsExpenseReport` trong `api/src/modules/analytics/service.ts`) được vẽ thành hình bằng cách nào để đưa vào tài liệu `pdfmake`.

Ràng buộc bắt buộc phải tuân theo khi so sánh phương án:

- Hạ tầng: container `api` chạy trên image `node:24-alpine` (mục "Hạ tầng" của AGENTS.md) – alpine dùng musl libc, các gói cần biên dịch native addon (node-gyp) rất dễ vỡ build hoặc cần cài thêm nhiều gói hệ thống làm phình image.
- Mục 9.10 (`docs/design/09-bao-mat.md`): "không gây ra tải xuống độc hại hoặc tải xuống không cần thiết"; tải xuống chỉ được sinh bởi chính hệ thống; không cho phép tải lên file thực thi/SVG/HTML từ người dùng cho các luồng dữ liệu đã quy định (CSV import). Tài liệu không có luồng "tải ảnh lên để nhúng vào tài liệu chính thức" nào khác được mô tả – việc thêm luồng này là mở rộng bề mặt tấn công ngoài phạm vi đã thiết kế.
- Thời gian: dự án làm trong khuôn khổ cuộc thi (Techwiz 7), ưu tiên giải pháp ít rủi ro gỡ lỗi hơn là ít dòng code nhất.

## Các quyết định

### 1. Cách đưa biểu đồ (doughnut, cột) vào PDF phía server

| Phương án                                                                                | Độ phức tạp                                                                                                                                                              | Dung lượng Docker image                                                                                                                                                                                                                               | Bảo mật                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Nhất quán giao diện                                                                                                                               | Thời gian làm                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. `chartjs-node-canvas` (canvas native)                                                 | Thấp về code (tái dùng cấu hình Chart.js y hệt frontend)                                                                                                                 | Cao: gói `canvas` cần biên dịch native (node-gyp) và các thư viện hệ thống Cairo/Pango/libjpeg/giflib/librsvg ở cả build-stage lẫn runtime-stage; trên alpine phải tự thêm nhiều gói `apk add` build lẫn runtime, ảnh runtime phình thêm hàng chục MB | Trung bình: thêm một dependency native lớn (bề mặt CVE của Cairo/Pango), nhưng không phát sinh luồng tải file mới từ người dùng                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Cao: ra hình giống hệt Chart.js trên web (raster PNG nhúng qua `image`)                                                                           | Rủi ro cao: các bản build sẵn (`prebuilds`) của `canvas` thường nhắm glibc, hay lỗi `Cannot find module '.../build/Release/canvas.node'` trên musl/alpine; nếu rơi vào trường hợp phải build từ source ngay trong CI/Docker, cuộc thi có thể mất nhiều giờ gỡ lỗi build – đúng rủi ro mà đề bài cảnh báo |
| B. Tự sinh SVG (doughnut, cột) bằng hàm TypeScript thuần, nhúng `pdfmake` qua node `svg` | Trung bình: phải tự viết công thức toạ độ (`M/L/A` cho cung tròn doughnut; `rect` cho cột) – nhưng phạm vi chỉ 2 dạng biểu đồ cố định, không cần bao quát mọi loại chart | Thấp nhất: `pdfmake` là JS thuần (dùng `pdfkit` + `svg-to-pdfkit` nội bộ), không cần addon native, không cần gói hệ thống thêm trên alpine                                                                                                            | Cao nhất: không có luồng tải file mới nào; dữ liệu vẽ biểu đồ hoàn toàn tính từ số liệu đã xác thực ở service, không có input file từ người dùng ở bước này                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Cao: có thể tự chọn màu trùng bảng màu Chart.js đang dùng ở frontend (chép cứng danh sách màu danh mục)                                           | Chấp nhận được: 2 hàm sinh SVG (doughnut + cột nhóm) là công việc giới hạn, ước lượng vài giờ, không phụ thuộc gỡ lỗi môi trường Docker                                                                                                                                                                  |
| C. Client chụp/gửi PNG biểu đồ lên khi xuất                                              | Thấp về code sinh PDF (chỉ `image` node với buffer nhận được)                                                                                                            | Không ảnh hưởng                                                                                                                                                                                                                                       | Thấp nhất: phát sinh luồng tải file (ảnh) từ trình duyệt lên server để nhúng vào một tài liệu PDF chính thức – vượt phạm vi luồng tải lên đã thiết kế ở mục 9.10 (chỉ có CSV); cần thêm validate/giải mã ảnh (rủi ro decompression bomb, cần re-encode an toàn – bản thân việc re-encode thường lại cần `sharp`/`canvas`, tức quay lại rủi ro native của phương án A); dữ liệu số trong ảnh do client gửi không còn được đảm bảo khớp 100% với số liệu server vừa tính (rủi ro toàn vẹn báo cáo tài chính, khác với ảnh PNG export mục 5.8 vốn là tính năng phụ trợ client-side độc lập, không phải bằng chứng tài chính chính thức) | Trung bình: phụ thuộc trạng thái render hiện tại của trình duyệt người dùng (dark mode, kích thước màn hình...) nên có thể lệch giữa các lần xuất | Có vẻ nhanh nhất lúc đầu nhưng phát sinh việc thiết kế thêm một endpoint upload ảnh + validate + (có thể) re-encode – tổng thời gian không hẳn ít hơn phương án B                                                                                                                                        |

**Chốt:** B – Tự sinh SVG đơn giản bằng hàm TypeScript thuần cho 2 dạng biểu đồ cần dùng (doughnut theo danh mục, cột nhóm thu/chi 6 tháng), nhúng vào `pdfmake` bằng node nội dung:

```ts
// ví dụ minh hoạ cấu trúc content của pdfmake, KHÔNG phải code thi công đầy đủ
{ svg: buildDoughnutSvg(categoryTotals), width: 220, height: 220 }
{ svg: buildMonthlyBarSvg(sixMonthTotals), width: 400, height: 200 }
```

**Lý do:** đây là phương án duy nhất vừa không thêm rủi ro build Docker alpine (không addon native), vừa không mở luồng tải file mới trái với mục 9.10, vừa đủ khả thi trong thời gian cuộc thi vì phạm vi chỉ giới hạn 2 dạng biểu đồ cố định (không cần một thư viện chart tổng quát). Loại A vì rủi ro vỡ build alpine đúng như đề bài cảnh báo. Loại C vì mở bề mặt tấn công tải lên ngoài thiết kế mục 9.10 và làm số liệu trong báo cáo tài chính phụ thuộc vào ảnh do client gửi thay vì số liệu server tính.

**Ràng buộc kỹ thuật quan trọng khi thi công (để tránh vỡ font tiếng Việt trong SVG):** `svg-to-pdfkit` (bộ vẽ SVG nội bộ của `pdfmake`) vẽ text theo font mặc định của PDFKit, **không** tự động dùng font Roboto đã đăng ký cho tài liệu và có rủi ro không hiển thị đúng dấu tiếng Việt nếu nhãn danh mục được vẽ trực tiếp bằng thẻ `<text>` trong SVG. Vì vậy:

- SVG tự sinh **chỉ chứa hình khối** (cung tròn doughnut, hình chữ nhật cột, trục, lưới) và số liệu thuần chữ số/ký hiệu `%` (không dấu) nếu cần ghi trong SVG.
- Tên danh mục, số tiền định dạng, chú giải (legend) có dấu tiếng Việt **phải** được vẽ bằng node văn bản/bảng thông thường của `pdfmake` đặt cạnh SVG (dùng font Roboto đã nhúng ở mục 2), không vẽ trong `<text>` của SVG.

### 2. Nhúng font Roboto/Noto Sans (glyph tiếng Việt) vào pdfmake

`pdfmake` phía server dùng class `PdfPrinter` (không phải bản build cho trình duyệt), nhận một **fonts descriptor** trỏ tới file `.ttf` thật trên đĩa – không dùng cơ chế `vfs_fonts.js` (chỉ dành cho bản chạy trong trình duyệt).

**Chốt:** dùng font **Roboto** (đúng như mục 5.8 đã nêu), bản Regular/Bold/Italic/BoldItalic tải từ Google Fonts (giấy phép Apache License 2.0, được phép đóng gói lại) – bộ Roboto chính thức của Google đã có subset Vietnamese (dấu thanh, ký tự mở rộng) nên không cần đổi sang Noto Sans; nếu khi thi công phát hiện Roboto thiếu glyph cho một số tổ hợp dấu hiếm gặp, đội thay bằng Noto Sans theo đúng cấu trúc bên dưới mà không đổi kiến trúc.

```ts
// api/src/lib/pdf/fonts.ts (đường dẫn minh hoạ, đội đặt lại theo cấu trúc module thực tế)
import PdfPrinter from "pdfmake";
import path from "node:path";

const fontsDir = path.join(import.meta.dirname, "../../assets/fonts");

const fonts = {
  Roboto: {
    normal: path.join(fontsDir, "Roboto-Regular.ttf"),
    bold: path.join(fontsDir, "Roboto-Bold.ttf"),
    italics: path.join(fontsDir, "Roboto-Italic.ttf"),
    bolditalics: path.join(fontsDir, "Roboto-BoldItalic.ttf"),
  },
};

export const pdfPrinter = new PdfPrinter(fonts);
// docDefinition cần: defaultStyle: { font: "Roboto" }
```

- 4 file `.ttf` (~700 KB tổng) được tải một lần, lưu trong repo (vd. `api/src/assets/fonts/`) và `COPY` vào Docker image qua Dockerfile hiện có – **không** tải font từ mạng lúc chạy container (tránh phụ thuộc mạng ngoài và rủi ro sinh RCE/SSRF nếu URL bị thay đổi).
- Vì là file `.ttf` thuần, không cần thêm gói hệ thống nào trên `node:24-alpine` để dùng được (khác hẳn phương án A ở mục 1).
- `defaultStyle.font = "Roboto"` áp dụng cho toàn bộ text node của tài liệu (bảng tổng hợp, top giao dịch, nhận định, ghi chú "Not financial advice", và phần chú giải danh mục cạnh SVG nêu ở mục 1) – đây là nơi duy nhất chịu trách nhiệm hiển thị đúng tên/mô tả có dấu tiếng Việt do người dùng nhập.

## Hệ quả

- Không tạo/sửa file code trong ADR này; các quyết định trên áp dụng khi thi công ở bước B.
- Thêm dependency mới: gói `pdfmake` (thi công cần đội duyệt như các thư viện khác trong AGENTS.md dù đã được mục 5.8 định trước).
- Cần thêm 4 file font tĩnh (`Roboto-Regular/Bold/Italic/BoldItalic.ttf`) đóng gói sẵn trong repo, không tải runtime.
- Loại trừ: KHÔNG dùng `chartjs-node-canvas`/`canvas` hay bất kỳ thư viện cần biên dịch native addon nào cho việc vẽ biểu đồ; KHÔNG thêm luồng upload ảnh biểu đồ từ client để nhúng vào PDF chính thức; KHÔNG vẽ nhãn có dấu tiếng Việt trực tiếp bằng `<text>` trong SVG.

## Checklist cho bước thi công

- [ ] Thêm `pdfmake` vào `api/package.json` (kèm `@types/pdfmake` nếu cần) và xác nhận version dùng API `PdfPrinter` (server-side) chứ không phải bản build trình duyệt.
- [ ] Tải 4 file Roboto TTF (Regular/Bold/Italic/BoldItalic) từ Google Fonts, đặt vào `api/src/assets/fonts/`, xác nhận Dockerfile `COPY` thư mục này vào image.
- [ ] Viết 2 hàm sinh SVG thuần TypeScript: `buildDoughnutSvg(categoryTotals)` và `buildMonthlyBarSvg(sixMonthTotals)`; chỉ vẽ hình khối/số không dấu bên trong SVG.
- [ ] Đặt tên danh mục/nhãn có dấu tiếng Việt vào node văn bản/bảng `pdfmake` thường (không phải trong SVG), dùng `defaultStyle.font = "Roboto"`.
- [ ] Viết test snapshot/kiểm tra tối thiểu: PDF sinh ra không lỗi khi tên danh mục/mô tả chứa ký tự tiếng Việt có dấu (vd. "Ăn uống", "Đi lại").
- [ ] Xác nhận response tải PDF tuân mục 9.10: `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, tên file an toàn (không phản chiếu trực tiếp input người dùng chưa làm sạch).
- [ ] Nếu phát hiện Roboto thiếu glyph cho một số tổ hợp dấu tiếng Việt hiếm gặp trong thực tế thi công, thay bằng bộ font Noto Sans theo đúng cấu trúc fonts descriptor ở mục 2 (không đổi kiến trúc).

## Đội đã chỉnh sửa gì so với bản nháp AI

_(Ghi rõ – phục vụ khai báo AI và bảo vệ trước giám khảo.)_

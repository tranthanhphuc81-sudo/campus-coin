<!-- Trích từ Tài liệu thiết kế kỹ thuật Campus Coin v1.0 (bản đã sửa). Nguồn gốc: file Word. Không sửa trực tiếp ở đây nếu chưa cập nhật file Word. -->

# 13. KẾ HOẠCH TRIỂN KHAI DỰ ÁN

## 13.1 Lộ trình

Kế hoạch tham khảo gồm 4 sprint × 1 tuần; ngày cụ thể điều chỉnh theo lịch cuộc thi.

***Hình 29: Kế hoạch triển khai theo sprint*** — mã nguồn Mermaid: [diagrams/v1_0_Hinh_29.mmd](diagrams/v1_0_Hinh_29.mmd); ảnh: [images/hinh-29.png](images/hinh-29.png)

***Bảng 70: Mục tiêu từng sprint***

| **Sprint** | **Mục tiêu** | **Sản phẩm bàn giao** |
| --- | --- | --- |
| 1 – Nền tảng | Thiết kế UI/ERD/API, hạ tầng dev, CI, xác thực, hồ sơ, danh mục | Đăng ký/đăng nhập/reset hoạt động, CI xanh |
| 2 – Nghiệp vụ lõi | Giao dịch, định kỳ, lịch sử, ngân sách, cảnh báo, dashboard | Người dùng ghi và xem chi tiêu, cảnh báo ngân sách |
| 3 – Báo cáo & AI | Báo cáo, xuất PDF, email, phân loại AI, nhập CSV, nhận định, tips | Toàn bộ chức năng AI và báo cáo |
| 4 – Hoàn thiện | Admin, trí tuệ hệ thống, accessibility, bảo mật, hiệu năng, kiểm thử luồng, tài liệu, video demo, triển khai | Bản production + gói nộp theo SRS 1.9 |

## 13.2 Rủi ro và biện pháp giảm thiểu

***Bảng 71: Rủi ro dự án***

| **Rủi ro** | **Khả năng** | **Ảnh hưởng** | **Giảm thiểu** |
| --- | --- | --- | --- |
| Nhà cung cấp LLM lỗi, đổi giá hoặc giới hạn | Trung bình | Trung bình | AI Adapter đa nhà cung cấp, fallback quy tắc/template, cache, quota |
| Lộ dữ liệu tài chính người dùng | Thấp | Rất cao | Chương 9: phân quyền sở hữu, mã hóa, test cross-tenant, audit |
| Chậm tiến độ do phạm vi rộng | Cao | Cao | Ưu tiên chức năng bắt buộc của SRS trước; tính năng mở rộng (OCR, forecast) sau; sprint ngắn có demo |
| Hiệu năng báo cáo giảm khi dữ liệu lớn | Trung bình | Trung bình | Chỉ mục, bảng tổng hợp, đo sớm bằng DevTools/Lighthouse |
| Mất dữ liệu do sự cố máy chủ | Thấp | Cao | Backup hằng ngày bằng mysqldump, chép ra ngoài VPS, thử khôi phục trước demo |
| Gợi ý AI sai gây khó chịu | Trung bình | Thấp | Luôn cho ghi đè, học từ sửa đổi, hiển thị độ tin cậy, đo tỷ lệ chấp nhận |
| Vi phạm quy định sử dụng AI của cuộc thi | Trung bình | Cao | AI chỉ hỗ trợ; nhóm tự hiểu và giải thích được mọi quyết định; khai báo công cụ AI (Phụ lục D) |

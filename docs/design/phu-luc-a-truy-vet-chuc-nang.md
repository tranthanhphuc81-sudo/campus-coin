<!-- Trích từ Tài liệu thiết kế kỹ thuật Campus Coin v1.0 (bản đã sửa). Nguồn gốc: file Word. Không sửa trực tiếp ở đây nếu chưa cập nhật file Word. -->

# PHỤ LỤC A. MA TRẬN TRUY VẾT YÊU CẦU CHỨC NĂNG

***Bảng 72: Truy vết yêu cầu chức năng***

| **Yêu cầu SRS 1.6** | **Mục thiết kế** | **API chính** | **Bảng dữ liệu** | **Test** |
| --- | --- | --- | --- | --- |
| Đăng ký, đăng nhập sinh viên; đăng nhập admin riêng | 5.1 | /auth/*, /admin/auth/* | users, refresh_tokens | TC-01–04, 08 |
| Quản lý phiên an toàn | 5.1.2, 9.5 | /auth/refresh, /me/sessions | refresh_tokens | TC-04 |
| Khôi phục mật khẩu qua email / token | 5.1.3 | /auth/forgot-password, /auth/reset-password | auth_tokens | TC-05 |
| Hồ sơ: tên, năm học, trợ cấp, mục tiêu tiết kiệm | 5.2 | /me | users | – |
| Nhập CSV lịch sử giao dịch | 5.5 | /imports/* | import_batches, transactions | TC-18, 19 |
| Danh mục thu/chi mặc định và cá nhân | 5.3 | /categories, /admin/categories | categories | TC-09, 10 |
| Dashboard: lời chào, số dư, thêm nhanh, tips, Top Category, Budget vs Actual | 5.7 | /dashboard/summary | transactions, budgets, user_tips | Kiểm thử luồng |
| Quick-add thu/chi | 5.4.1 | POST /transactions | transactions | TC-11 |
| Giao dịch định kỳ | 5.4.2 | /recurring-rules | recurring_rules, transactions | TC-14 |
| Sửa/xóa giữ đầy đủ lịch sử | 5.4.1, 5.4.3 | PATCH/DELETE /transactions, /history | transaction_history | TC-12, 13 |
| AI gợi ý danh mục, học từ sửa đổi, ghi đè, phân loại hàng loạt CSV | 5.6 | /ai/* | ai_category_rules, transactions | TC-15–17 |
| Báo cáo danh mục, thu vs chi 6 tháng, ngày/tuần, lọc | 5.8 | /reports/* | transactions | TC-21 |
| Xuất PDF/ảnh | 5.8 | /reports/monthly/export | – | TC-21 |
| AI nhận định tháng, flag tăng trưởng, lời khuyên, lưu lịch sử | 5.9 | /insights/* | insights | TC-22 |
| Tips engine: so với trung bình/ngân sách, xếp hạng, dismiss/pin | 5.10 | /tips/* | user_tips, tip_templates | TC-23 |
| Ngân sách theo danh mục, progress bar, thông báo | 5.11 | /budgets, /notifications | budgets, notifications | TC-20 |
| Bookmark tip/insight; xuất và chia sẻ email | 5.12 | /bookmarks, /reports/monthly/share | bookmarks | Kiểm thử luồng |
| Admin: danh mục mặc định, mẫu tip/thông báo, tài khoản, thống kê | 5.13 | /admin/* | categories, tip_templates, announcements, audit_logs | TC-07, 08 |
| Giao dịch xem/sửa gần đây | 5.14 | /activity/recent | recent_activity | Kiểm thử luồng |
| Dự báo tháng tới | 5.14 | /forecast/next-month | transactions, recurring_rules | Unit |
| Phát hiện bất thường / trùng lặp | 5.14 | /transactions/{id}/resolve-flag | transactions | TC-24, 25 |
| Dark mode, cỡ chữ, breadcrumbs, loading indicators | 5.15, 8.5, 8.6 | /me (preferences) | users.preferences | TC-27 |
| Chatbot hỗ trợ (SRS 1.8) | 3.4 | – (widget Tawk.to) | – | Thủ công |
| Sitemap trên trang chủ (SRS 1.9) | 8.1 | – | – | Kiểm thử luồng |

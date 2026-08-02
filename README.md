# Hồi Âm Đam Mỹ V06.1.12

Phiên bản V06.1.12 nâng cấp toàn bộ giao diện công khai và dashboard quản trị nhưng vẫn dùng chung dữ liệu Supabase hiện có.

## Thống kê truy cập

- Vercel Web Analytics được bật trên toàn bộ trang công khai.
- Trang quản trị không được đưa vào số liệu khách truy cập.
- Dữ liệu bắt đầu được ghi nhận sau khi deploy và có lượt truy cập mới; không khôi phục được lịch sử trước đó.
- Web Analytics tổng hợp dữ liệu ẩn danh và không dùng cookie bên thứ ba.

Toàn bộ endpoint được rewrite vào một Vercel Function để tương thích giới hạn của gói Hobby, kể cả các URL nhiều tầng như vote và trang quản trị. URL API công khai và cách sử dụng không thay đổi.

## Có gì mới

- Nền Ngân Hà WebP 80 KB, giao diện responsive và hỗ trợ giảm chuyển động.
- Bốn trạng thái: Đề xuất, Đã chọn, Đang lên sóng, Đã hoàn thành.
- Kho truyện lọc theo Convert/Edit, nguồn, vote và thời gian.
- Vote và bỏ vote; chỉ mở khi truyện còn ở trạng thái Đề xuất.
- Kho truyện đã hoàn thành và chức năng thêm lại truyện cũ.
- Cảnh báo nguồn do admin chủ động xác nhận, bật công khai và đặt thời hạn.
- Người dùng gửi nguồn thay thế; admin duyệt trước khi áp dụng.
- Donate qua website, YouTube hoặc email; admin xác nhận trước khi cộng vote.
- VietQR tự điền tài khoản, số tiền và nội dung; ảnh QR thủ công được giữ làm phương án dự phòng.
- Trên điện thoại có thể chọn ứng dụng ngân hàng; các app mở thẳng chuyển tiền được ưu tiên và form được giữ khi quay lại.
- Khi trở về từ ứng dụng ngân hàng, form Tặng Cá tự mở lại với toàn bộ thông tin đã nhập để gửi admin xác nhận.
- Bộ chọn truyện gộp tìm kiếm vào ngay trong danh sách; nút Tặng Cá từ thẻ truyện sẽ khóa sẵn đúng truyện đó.
- Nút mở ngân hàng có trạng thái tải, giới hạn chờ và danh sách dự phòng khi API VietQR chậm hoặc bị chặn.
- `1 Cá = 1 Linh Thạch = 1.000 VNĐ`, vote dùng đúng bảng tỷ lệ cũ.
- Email kết quả gửi từ `hoiamdammy@gmail.com` nếu người donate nhập email.
- About Me, mạng xã hội, ngân hàng, QR và thông báo đều chỉnh được trong dashboard.
- Thùng rác mềm và nhật ký thao tác; không tự xóa dữ liệu.
- Nút hướng dẫn nằm trực tiếp trong form, trạng thái vote rõ ràng và Top 3 có ảnh bìa/thông tin đầy đủ.
- Bảng quản trị có thêm lọc nguồn, loại bản, kênh donate và sắp xếp theo vote hoặc số tiền.
- SEO cơ bản gồm canonical, Open Graph, dữ liệu cấu trúc, `robots.txt` và `sitemap.xml`.
- Chính sách quyền riêng tư và điều khoản sử dụng công khai, có liên kết ở chân trang và nội dung minh bạch về cookie, quảng cáo, vote cùng donate.
- `ads.txt` được phục vụ dưới dạng văn bản thuần; CSP tương thích tài nguyên quảng cáo động và Google Privacy & messaging.
- Sửa bỏ vote trên database cũ và ẩn lỗi 404 của các module chưa chạy migration.
- Migration tự thay ràng buộc trạng thái cũ trước khi đổi `đang đọc` thành `đang lên sóng`.
- Tắt cache dữ liệu động để vote, kho truyện, thông báo và thiết lập mới hiển thị ngay khi tải lại trang.
- Icon được đóng gói trong website; menu có icon và tự đánh dấu khu vực đang xem.
- Giữ nguyên `ads.txt` và gắn Google Auto Ads theo mã quảng cáo hiện có.

## Chạy local từ phiên bản cũ

Mở CMD trong thư mục V06:

```bat
setup-local.cmd "E:\hoiam-v05"
run-local.cmd
```

`setup-local.cmd` chỉ sao chép `.env.local` và `.vercel\project.json`, sau đó cài các gói cần thiết. Không sao chép mã nguồn cũ và không deploy.

Website mở tại `http://localhost:3000`.

> Local dùng dữ liệu Supabase thật. Vote, gửi đề xuất và thao tác admin sẽ tác động dữ liệu thật.

## Bắt buộc trước khi dùng tính năng V06

1. Sao lưu database Supabase.
2. Mở Supabase Dashboard → SQL Editor.
3. Chạy toàn bộ file `supabase.sql` một lần.
4. Không cần xóa bảng `stories`; migration chỉ bổ sung cột và bảng mới.

Nếu chưa chạy migration, trang công khai và danh sách truyện trong dashboard vẫn đọc được dữ liệu cũ để bạn xem giao diện. Các chức năng mới như donate, nguồn thay thế và lưu trường dữ liệu V06 sẽ nhắc chạy `supabase.sql`.

## Biến môi trường

Các biến Supabase và admin cũ vẫn được giữ. Biến mới có giá trị mặc định theo tên bảng trong `supabase.sql`.

Để gửi email cho người donate, thêm vào `.env.local` và Vercel:

```env
DONATION_SENDER_EMAIL=hoiamdammy@gmail.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=hoiamdammy@gmail.com
SMTP_APP_PASSWORD=APP_PASSWORD_16_KY_TU
```

`SMTP_APP_PASSWORD` là Google App Password, không phải mật khẩu Gmail thông thường. Không gửi khóa qua chat và không commit `.env.local`.

## Quy đổi donate

| Tổng tiền | Giá mỗi vote |
|---:|---:|
| Dưới 100.000đ | 5.000đ |
| Từ 100.000đ | 4.500đ |
| Từ 200.000đ | 4.000đ |
| Từ 500.000đ | 3.500đ |
| Từ 1.000.000đ | 3.000đ |

Hệ thống làm tròn xuống và chỉ đề xuất số vote. Admin được sửa số vote trước khi cộng. Hàm SQL `apply_donation_votes` bảo đảm cùng một donate không bị cộng hai lần.

## Kiểm tra trước khi đưa lên GitHub

```bat
npm run check
run-local.cmd
```

Kiểm tra trang chủ, `/completed.html`, `/guide.html`, `/about.html`, `/privacy.html`, `/terms.html` và `/admin.html`. Chỉ cập nhật GitHub/Vercel sau khi đã kiểm tra local và sao lưu Supabase.

## Hoàn tất AdSense sau khi deploy

1. Mở `/ads.txt` và xác nhận Publisher ID hiển thị dưới dạng văn bản thuần.
2. Trong AdSense, xác minh quyền sở hữu bằng `ads.txt` hoặc thẻ meta rồi yêu cầu xem xét website.
3. Vào **Quyền riêng tư và thông báo**, tạo thông báo **Quy định tại Châu Âu**, chọn giải pháp quản lý sự đồng ý của Google và xuất bản cho website.
4. Chỉ bật Auto Ads trên các trang nội dung công khai; `admin.html`, `privacy.html` và `terms.html` không tải mã quảng cáo.
5. Không tự bấm quảng cáo, không kêu gọi người khác bấm và không đặt quảng cáo sát nút vote, form hoặc nút điều hướng.

# Chạy Hồi Âm V06 trên Windows

## Lần đầu mở thư mục V06

```bat
setup-local.cmd "E:\hoiam-v05"
```

Thay đường dẫn bằng thư mục phiên bản cũ đang có `.env.local`. Công cụ chỉ nhập cấu hình local và liên kết Vercel, không đụng mã nguồn cũ.

Sau đó:

```bat
run-local.cmd
```

Mở `http://localhost:3000`.

## Lấy lại biến từ Vercel

```bat
npx vercel@latest login
npx vercel@latest link
npx vercel@latest env pull .env.local --environment=production
```

Nếu khóa Supabase tải từ Vercel bị che hoặc không dùng được, lấy Secret key thật tại Supabase Dashboard → Project Settings → API Keys. Không dán khóa vào chat.

## Dữ liệu thật

Local kết nối cùng Supabase với website production. Chỉ xem, tìm kiếm và lọc thì không thay đổi dữ liệu. Vote, gửi đề xuất, xác nhận donate và thao tác admin sẽ thay đổi dữ liệu thật.

## Migration V06

Sao lưu Supabase rồi chạy `supabase.sql` trong SQL Editor trước khi kiểm tra dashboard mới. Migration không đặt lại vote và không xóa truyện.

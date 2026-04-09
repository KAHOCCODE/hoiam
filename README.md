# Hồi Âm Admin tách riêng

Bộ này chỉ tách riêng phần admin, để bạn ghép vào repo hiện tại trước khi nâng cấp tiếp giao diện public.

## File cần chép vào repo

- `admin.html`
- `assets/styles.css`
- `assets/admin.js`
- `api/_lib/*`
- `api/admin/*`
- `vercel.json`

## Biến môi trường trên Vercel

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_PASSWORD`
- `ADMIN_SESSION_SECRET`
- `SUPABASE_STORIES_TABLE` = `stories` (tùy chọn)

## Luồng chạy

- `/admin.html` là trang đăng nhập admin
- API admin dùng cookie HttpOnly ký bằng `ADMIN_SESSION_SECRET`
- Quyền sửa/xóa/ẩn-hiện chạy qua serverless API, không lộ trên client công khai

## Ghi chú

- Trang admin đã hỗ trợ `visible` để ẩn/hiện truyện ngoài public
- Xóa trong admin là xóa thật khỏi database
- Nếu bạn đã có `vercel.json`, hãy gộp phần `headers` thay vì chép đè mù

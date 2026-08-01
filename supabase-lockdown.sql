-- CHỈ CHẠY SAU KHI mã mới đã deploy và các API /api/stories hoạt động ổn định.
-- Các lệnh này ngăn trình duyệt truy cập thẳng bảng stories bằng anon key.

alter table public.stories enable row level security;
revoke all on table public.stories from anon;
revoke all on table public.stories from authenticated;

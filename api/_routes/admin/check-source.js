const { allowMethods, json, parseJson, safeUrl, requireSameOrigin } = require('../_lib/utils');
const { requireAdmin } = require('../_lib/auth');

function blockedHost(hostname) {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host === '0.0.0.0' || host === '::1' || host.startsWith('[')) return true;
  const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const [a, b] = match.slice(1).map(Number);
  return a === 10 || a === 127 || a === 0 ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || a >= 224;
}

module.exports = async (req, res) => {
  if (!allowMethods(req, res, ['POST'])) return;
  if (!requireSameOrigin(req, res)) return;
  if (!requireAdmin(req, res)) return;

  try {
    const body = await parseJson(req);
    const url = safeUrl(body.url);
    if (!url) return json(res, 400, { error: 'URL không hợp lệ.' });
    const parsed = new URL(url);
    if (blockedHost(parsed.hostname)) return json(res, 400, { error: 'Không thể kiểm tra địa chỉ nội bộ.' });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    let response;
    try {
      response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: { 'User-Agent': 'HoiAmSourceCheck/1.0' },
      });
    } finally {
      clearTimeout(timeout);
    }

    return json(res, 200, {
      reachable: response.ok,
      status: response.status,
      final_url: response.url,
      note: response.ok
        ? 'Nguồn có phản hồi. Admin vẫn cần mở kiểm tra nội dung.'
        : 'Nguồn trả về lỗi. Đây chỉ là kết quả nghi ngờ, chưa công khai.',
    });
  } catch (error) {
    return json(res, 200, {
      reachable: false,
      status: 0,
      final_url: '',
      note: error.name === 'AbortError'
        ? 'Nguồn phản hồi quá 10 giây. Chỉ đánh dấu nghi ngờ để admin kiểm tra.'
        : 'Không kết nối được. Chỉ đánh dấu nghi ngờ để admin kiểm tra.',
    });
  }
};

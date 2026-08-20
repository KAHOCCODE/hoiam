const { json } = require('./_routes/_lib/utils');

const exactRoutes = new Map([
  ['bootstrap', require('./_routes/bootstrap')],
  ['admin/announcements', require('./_routes/admin/announcements/index')],
  ['admin/bootstrap', require('./_routes/admin/bootstrap')],
  ['admin/check-source', require('./_routes/admin/check-source')],
  ['admin/cover-image', require('./_routes/admin/cover-image')],
  ['admin/donations', require('./_routes/admin/donations/index')],
  ['admin/login', require('./_routes/admin/login')],
  ['admin/logout', require('./_routes/admin/logout')],
  ['admin/settings', require('./_routes/admin/settings/index')],
  ['admin/source-replacements', require('./_routes/admin/source-replacements/index')],
  ['admin/stories', require('./_routes/admin/stories/index')],
  ['donations', require('./_routes/donations/index')],
  ['settings', require('./_routes/settings/index')],
  ['source-replacements', require('./_routes/source-replacements/index')],
  ['stories', require('./_routes/stories/index')],
  ['suggestions', require('./_routes/suggestions/index')],
]);

const dynamicRoutes = [
  [/^admin\/announcements\/(\d+)$/, require('./_routes/admin/announcements/[id]')],
  [/^admin\/donations\/(\d+)$/, require('./_routes/admin/donations/[id]')],
  [/^admin\/source-replacements\/(\d+)$/, require('./_routes/admin/source-replacements/[id]')],
  [/^admin\/stories\/(\d+)$/, require('./_routes/admin/stories/[id]')],
  [/^stories\/(\d+)\/metrics$/, require('./_routes/stories/[id]/metrics')],
  [/^stories\/(\d+)\/vote$/, require('./_routes/stories/[id]/vote')],
];

function requestPath(req) {
  try {
    const pathname = new URL(req.url || '/', 'http://localhost').pathname;
    const value = pathname.replace(/^\/api\/?/, '').replace(/^\/+|\/+$/g, '');
    if (value && value !== '[...path]') return value;
  } catch { /* dùng route parameter bên dưới */ }

  const value = req.query?.path;
  return (Array.isArray(value) ? value.join('/') : String(value || ''))
    .replace(/^\/+|\/+$/g, '');
}

function resolveRoute(pathname) {
  const exact = exactRoutes.get(pathname);
  if (exact) return { handler: exact, id: null };

  for (const [pattern, handler] of dynamicRoutes) {
    const match = pathname.match(pattern);
    if (match) return { handler, id: match[1] };
  }

  return null;
}

module.exports = async (req, res) => {
  const pathname = requestPath(req);
  const route = resolveRoute(pathname);

  if (!route) {
    return json(res, 404, { error: 'Không tìm thấy API.' });
  }

  req.query = { ...(req.query || {}) };
  delete req.query.path;
  if (route.id) req.query.id = route.id;

  return route.handler(req, res);
};

module.exports.requestPath = requestPath;
module.exports.resolveRoute = resolveRoute;

const { allowMethods, json, parseJson } = require('../_lib/utils');
const { verifyPassword, setSession } = require('../_lib/auth');

module.exports = async (req, res) => {
  if (!allowMethods(req, res, ['POST'])) return;

  try {
    const body = await parseJson(req);
    if (!verifyPassword(body.password || '')) {
      return json(res, 401, { error: 'Mật khẩu không đúng.' });
    }

    setSession(res);
    json(res, 200, { ok: true });
  } catch (error) {
    json(res, 500, { error: error.message || 'Không thể đăng nhập.' });
  }
};

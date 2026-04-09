const { allowMethods, json } = require('../_lib/utils');
const { clearSession } = require('../_lib/auth');

module.exports = async (req, res) => {
  if (!allowMethods(req, res, ['POST'])) return;
  clearSession(res);
  json(res, 200, { ok: true });
};

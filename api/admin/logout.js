const { allowMethods, json, requireSameOrigin } = require('../_lib/utils');
const { clearSession } = require('../_lib/auth');

module.exports = async (req, res) => {
  if (!allowMethods(req, res, ['POST'])) return;
  if (!requireSameOrigin(req, res)) return;
  clearSession(req, res);
  json(res, 200, { ok: true });
};

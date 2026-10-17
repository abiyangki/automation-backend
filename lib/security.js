// Minimal security module to unblock deploy
const crypto = require('crypto');

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function checkAuth(req, secret) {
  const token = req.headers['x-dashboard-secret'] || req.query.secret;
  return token && token === secret;
}

function requireAuth(secret) {
  return (req, res, next) => {
    if (checkAuth(req, secret)) return next();
    return res.status(401).json({ error: 'Unauthorized' });
  };
}

module.exports = {
  hashPassword,
  checkAuth,
  requireAuth,
};

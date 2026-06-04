const jwt = require('jsonwebtoken');

function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

function requireAuth(req, res, next) {
  try {
    const payload = verifyToken(req.cookies?.token);
    req.jugadorId = payload.jugadorId;
    req.nombreUsuario = payload.nombreUsuario;
    next();
  } catch {
    res.status(401).json({ error: 'No autorizado' });
  }
}

function requireAuthWeb(req, res, next) {
  try {
    const payload = verifyToken(req.cookies?.token);
    req.jugadorId = payload.jugadorId;
    req.nombreUsuario = payload.nombreUsuario;
    next();
  } catch {
    res.clearCookie('token');
    res.clearCookie('nombreUsuario');
    res.clearCookie('jugadorId');
    res.redirect('/public/bienvenida');
  }
}

module.exports = { requireAuth, requireAuthWeb };

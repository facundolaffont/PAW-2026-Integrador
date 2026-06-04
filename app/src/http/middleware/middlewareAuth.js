const db = require('../../persistencia/Persistencia');
const logger = require('../../logger');

/**
 * Middleware que verifica que el jugador tiene una sesión activa.
 * Lee el jugadorId desde la cookie HttpOnly.
 * Si la sesión es válida, expone req.jugadorId para los handlers.
 * Responde con 401 si no hay sesión válida.
 */
function requireAuth(req, res, next) {
  const jugadorId = req.cookies?.jugadorId;

  if (!jugadorId || !db.jugadorEstaLogueado(jugadorId)) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  req.jugadorId = jugadorId;
  next();
}

module.exports = requireAuth;

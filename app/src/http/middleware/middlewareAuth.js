const db = require('../../persistencia/Persistencia');
const logger = require('../../logger');

/**
 * Middleware que verifica que el jugador tiene una sesión activa.
 * Lee el jugadorId desde el header X-Jugador-Id o desde req.body.jugadorId.
 * Si la sesión es válida, expone req.jugadorId para los handlers.
 * Responde con 401 si no hay sesión válida.
 */
function requireAuth(req, res, next) {
  const jugadorId = req.headers['x-jugador-id'] || req.body?.jugadorId;

  if (!jugadorId || !db.jugadorEstaLogueado(jugadorId)) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  req.jugadorId = jugadorId;
  next();
}

module.exports = requireAuth;

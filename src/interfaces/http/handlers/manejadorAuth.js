const express = require('express');
const jwt = require('jsonwebtoken');
const logger = require('#infraestructura/shared/logger');
/**
 * Manejador HTTP de autenticación. Expone las rutas de registro, ingreso,
 * cierre de sesión y consulta del jugador autenticado (`/me`).
 * Traduce peticiones REST en llamadas al controlador, emite tokens JWT en
 * cookies HTTP-only y devuelve respuestas JSON o códigos de estado apropiados.
 *
 * Endpoints (montado en `/api`):
 * - `GET /api/me` — devuelve el jugador autenticado según la cookie JWT.
 * - `POST /api/registrarse` — registra un nuevo jugador y emite sesión.
 * - `POST /api/ingresar` — inicia sesión y emite cookie JWT.
 * - `POST /api/salir` — cierra sesión y elimina las cookies.
 *
 * @param {import('#controladores/AuthController')} controller - Controlador con la lógica de registro e ingreso.
 */
class ManejadorAuth {
  constructor(controller) {
    logger.logContext(this);
    this.controller = controller;
    this.router = express.Router();
    this.#registrarRutas();
  }

  /**
   * Emite un token JWT y lo establece en las cookies de la respuesta.
   *
   * @param {import('express').Response} res - Objeto de respuesta de Express.
   * @param {string} jugadorId - ID del jugador autenticado.
   * @param {string} nombreUsuario - Nombre de usuario del jugador autenticado.
   */
  #emitirToken(res, jugadorId, nombreUsuario) {
    const token = jwt.sign({ jugadorId, nombreUsuario }, process.env.JWT_SECRET, {
      expiresIn: '1d',
    });
    const secure = process.env.NODE_ENV === 'production';
    res.cookie('token', token, { httpOnly: true, sameSite: 'lax', secure });
    res.cookie('nombreUsuario', nombreUsuario, { sameSite: 'lax', secure });
  }

  /**
   * Registra un nuevo jugador y emite un token JWT.
   *
   * @param {import('express').Request} req - Objeto de solicitud de Express.
   * @param {import('express').Response} res - Objeto de respuesta de Express.
   * @returns {Promise<void>}
   */
  async registrar(req, res) {
    logger.logContext(this);
    const result = await this.controller.registrar(req.body.nombreUsuario, req.body.password);
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    this.#emitirToken(res, result.data.jugadorId, result.data.nombreUsuario);
    res.status(201).json(result.data);
  }

  /**
   * Inicia sesión del jugador y emite un token JWT.
   *
   * @param {import('express').Request} req - Objeto de solicitud de Express.
   * @param {import('express').Response} res - Objeto de respuesta de Express.
   * @returns {Promise<void>}
   */
  async ingresar(req, res) {
    logger.logContext(this);
    const result = await this.controller.ingresar(req.body.nombreUsuario, req.body.password);
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    this.#emitirToken(res, result.data.jugadorId, result.data.nombreUsuario);
    res.json(result.data);
  }

  /**
   * Cierra la sesión del jugador eliminando las cookies de autenticación.
   *
   * @param {import('express').Request} req - Objeto de solicitud de Express.
   * @param {import('express').Response} res - Objeto de respuesta de Express.
   */
  salir(req, res) {
    logger.logContext(this);
    res.clearCookie('token');
    res.clearCookie('nombreUsuario');
    res.clearCookie('jugadorId'); // limpia cookie residual de versión anterior
    res.status(204).send();
  }

  /**
   * Devuelve el jugador autenticado según la cookie JWT.
   *
   * @param {import('express').Request} req - Objeto de solicitud de Express.
   * @param {import('express').Response} res - Objeto de respuesta de Express.
   */
  me(req, res) {
    logger.logContext(this);
    try {
      // Realiza las validaciones correspondientes de la cookie JWT (firma, expiración, etc.).
      const payload = jwt.verify(req.cookies?.token, process.env.JWT_SECRET);

      res.json({ jugadorId: payload.jugadorId, nombreUsuario: payload.nombreUsuario });
    } catch {
      res.status(401).json({ error: 'No autorizado' });
    }
  }

  /**
   * Registra las rutas HTTP del manejador en el router de Express.
   *
   * Cada ruta traduce la petición REST en una llamada al controlador y devuelve
   * la respuesta JSON o el código de estado correspondiente.
   *
   * Las rutas están montadas en `/api`.
   *
   * @private
   * @returns {void}
   */
  #registrarRutas() {
    logger.logContext(this);
    this.router.get('/me', (req, res) => this.me(req, res));
    this.router.post('/registrarse', (req, res) => this.registrar(req, res));
    this.router.post('/ingresar', (req, res) => this.ingresar(req, res));
    this.router.post('/salir', (req, res) => this.salir(req, res));
  }
}

module.exports = ManejadorAuth;

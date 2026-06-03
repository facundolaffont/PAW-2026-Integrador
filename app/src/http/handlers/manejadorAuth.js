const express = require('express');
const requireAuth = require('../middleware/middlewareAuth');
const logger = require('../../logger');
const { logContext } = require('../../utils');

/**
 * ManejadorAuth es responsable de manejar las rutas relacionadas con la autenticación
 * de usuarios, como el registro, ingreso y salida. Utiliza un controlador de
 * autenticación para realizar las operaciones necesarias y devuelve las correspondientes
 * respuestas HTTP.
 *
 * Las rutas que maneja son:
 * - POST /registrarse: para registrar un nuevo usuario.
 * - POST /ingresar: para que un usuario existente pueda ingresar.
 * - POST /salir: para que un usuario logueado pueda cerrar su sesión.
 *
 * Cada método del manejador llama al controlador correspondiente y maneja la respuesta HTTP
 * según el resultado obtenido del controlador, devolviendo errores con códigos
 * de estado apropiados cuando sea necesario.
 *
 * @param {AuthController} controller - El controlador de autenticación que se utilizará.
 */
class ManejadorAuth {
  constructor(controller) {
    logContext(logger, this);

    this.controller = controller;
    this.router = express.Router();
    this.#registrarRutas();
  }

  async registrar(req, res) {
    logContext(logger, this);

    const result = await this.controller.registrar(req.body.nombreUsuario, req.body.password);

    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }

    res.status(201).json(result.data);
  }

  async ingresar(req, res) {
    logContext(logger, this);
    const result = await this.controller.ingresar(req.body.nombreUsuario, req.body.password);

    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }

    res.json(result.data);
  }

  async salir(req, res) {
    logContext(logger, this);

    // Usamos el jugadorId verificado por el middleware, no el del body,
    // para que un jugador solo pueda cerrar su propia sesión.
    const result = await this.controller.salir(req.jugadorId);

    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }

    res.status(204).send();
  }

  #registrarRutas() {
    logContext(logger, this);
    this.router.post('/registrarse', (req, res) => this.registrar(req, res));
    this.router.post('/ingresar', (req, res) => this.ingresar(req, res));
    this.router.post('/salir', requireAuth, (req, res) => this.salir(req, res));
  }
}

module.exports = ManejadorAuth;

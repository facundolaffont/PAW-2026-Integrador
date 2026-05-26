const express = require('express');
const requireAuth = require('../middleware/middlewareAuth');
const logger = require('../../logger');
const { logContext } = require('../../utils');

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

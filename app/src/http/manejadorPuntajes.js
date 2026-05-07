const express = require('express');
const logger = require('../logger');
const { logContext } = require('../utils');

class ManejadorPuntajes {
  constructor(controller) {
    logContext(logger, this);
    this.controller = controller;

    this.router = express.Router();

    this.#registrarRutas();
  }

  async listar(req, res) {
    logContext(logger, this);
    try {
      const puntajes = await this.controller.listarPuntajes();
      res.json(puntajes);
    } catch (error) {
      res.status(500).json({ error: 'Error al cargar puntajes.' });
    }
  }

  #registrarRutas() {
    logContext(logger, this);
    this.router.get('/', (req, res) => this.listar(req, res));
  }
}

module.exports = ManejadorPuntajes;

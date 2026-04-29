const express = require('express');

class ManejadorPuntajes {

  constructor(controller) {
    this.controller = controller;

    this.router = express.Router();

    this.#registrarRutas();
  }

  async listar(req, res) {
    const puntajes = await this.controller.listarPuntajes();

    res.json(puntajes);
  }

  #registrarRutas() {
    this.router.get('/', (req, res) => this.listar(req, res));
  }
  
}

module.exports = ManejadorPuntajes;

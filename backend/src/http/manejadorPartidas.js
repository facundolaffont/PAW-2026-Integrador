const express = require('express');

class ManejadorPartidas {
  constructor(controller) {
    this.controller = controller;

    this.router = express.Router();

    this._registrarRutas();
  }

  _registrarRutas() {
    this.router.get('/', (req, res) => this.listar(req, res));

    this.router.post('/', (req, res) => this.crear(req, res));

    this.router.get('/:id', (req, res) => this.obtener(req, res));
  }

  listar(req, res) {
    res.json(this.controller.listarPartidas());
  }

  async crear(req, res) {
    const { jugadorId, maxJugadores, cantidadBots } = req.body;

    const result = await this.controller.crearPartida(jugadorId, maxJugadores, cantidadBots);

    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }

    res.status(201).json(result.data);
  }

  obtener(req, res) {
    const result = this.controller.obtenerPartida(req.params.id);

    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }

    res.json(result.data);
  }
}

module.exports = ManejadorPartidas;

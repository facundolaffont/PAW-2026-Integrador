const express = require('express');
const db = require('../db/Persistencia');

class PuntajesController {
  constructor() {
    this.router = express.Router();

    this._registrarRutas();
  }

  _registrarRutas() {
    this.router.get('/', (req, res) => this.listar(req, res));
  }

  async listar(req, res) {
    res.json(await db.obtenerPuntajes());
  }
}

module.exports = PuntajesController;

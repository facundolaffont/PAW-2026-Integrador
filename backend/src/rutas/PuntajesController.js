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

  listar(req, res) {
    res.json(db.obtenerPuntajes());
  }
}

module.exports = PuntajesController;

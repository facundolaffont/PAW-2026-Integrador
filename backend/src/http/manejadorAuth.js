const express = require('express');

class ManejadorAuth {
  constructor(controller) {
    this.controller = controller;

    this.router = express.Router();

    this._registrarRutas();
  }

  _registrarRutas() {
    this.router.post('/registrarse', (req, res) => this.registrar(req, res));

    this.router.post('/ingresar', (req, res) => this.ingresar(req, res));
  }

  async registrar(req, res) {
    const result = await this.controller.registrar(req.body.nombreUsuario);

    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }

    res.status(201).json(result.data);
  }

  async ingresar(req, res) {
    const result = await this.controller.ingresar(req.body.nombreUsuario);

    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }

    res.json(result.data);
  }
}

module.exports = ManejadorAuth;

const express = require('express');

class ManejadorAuth {
  constructor(controller) {
    this.controller = controller;

    this.router = express.Router();

    this.#registrarRutas();
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

  #registrarRutas() {
    /**
     * @swagger
     * /api/registrarse:
     *   post:
     *     summary: Registra un nuevo jugador
     *     tags:
     *       - Jugadores
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             properties:
     *               nombreUsuario:
     *                 type: string
     *     responses:
     *       201:
     *         description: Jugador registrado
     *       400:
     *         description: Error en los datos enviados
     */
    this.router.post('/registrarse', (req, res) => this.registrar(req, res));

    /**
     * @swagger
     * /api/ingresar:
     *   post:
     *     summary: Ingresar con nombre de usuario
     *     tags:
     *       - Jugadores
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             properties:
     *               nombreUsuario:
     *                 type: string
     *     responses:
     *       200:
     *         description: Ingreso exitoso
     *       400:
     *         description: Error en los datos enviados
     */
    this.router.post('/ingresar', (req, res) => this.ingresar(req, res));
  }
}

module.exports = ManejadorAuth;

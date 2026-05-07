const express = require('express');
const requireAuth = require('./middlewareAuth');
const logger = require('../logger');
const { logContext } = require('../utils');

class ManejadorAuth {
  constructor(controller) {
    logContext(logger, this);
    this.controller = controller;

    this.router = express.Router();

    this.#registrarRutas();
  }

  async registrar(req, res) {
    logContext(logger, this);
    const result = await this.controller.registrar(req.body.nombreUsuario);

    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }

    res.status(201).json(result.data);
  }

  async ingresar(req, res) {
    logContext(logger, this);
    const result = await this.controller.ingresar(req.body.nombreUsuario);

    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }

    res.json(result.data);
  }

  async salir(req, res) {
    logContext(logger, this);
    const result = await this.controller.salir(req.body.jugadorId);

    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }

    res.status(204).send();
  }

  #registrarRutas() {
    logContext(logger, this);
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

    /**
     * @swagger
     * /api/salir:
     *   post:
     *     summary: Cierra sesión del jugador
     *     tags:
     *       - Jugadores
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             properties:
     *               jugadorId:
     *                 type: string
     *     responses:
     *       204:
     *         description: Salida exitosa
     *       400:
     *         description: Error en los datos enviados
     */
    this.router.post('/salir', requireAuth, (req, res) => this.salir(req, res));
  }
}

module.exports = ManejadorAuth;

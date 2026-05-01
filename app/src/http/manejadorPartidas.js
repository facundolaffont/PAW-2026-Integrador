const express = require('express');
const logger = require('../logger');
const { registerLog, logContext } = require('../utils');

class ManejadorPartidas {
  constructor(controller) {
    this.controller = controller;

    this.router = express.Router();

    this.#registrarRutas();
  }

  listar(req, res) {
    logContext(logger, this);

    res.json(this.controller.listarPartidas());
  }

  async crear(req, res) {
    try {
      logContext(logger, this);

      const { jugadorId, maxJugadores, cantidadBots } = req.body;

      registerLog(logger, 'debug', 'Creando partida con los siguientes datos.', {
        jugadorId,
        maxJugadores,
        cantidadBots,
      });
      const result = await this.controller.crearPartida(jugadorId, maxJugadores, cantidadBots);

      if (!result.ok) {
        return res.status(result.status).json({ error: result.error });
      }

      res.status(201).json(result.data);

      obtener(req, res) {
        const result = this.controller.obtenerPartida(req.params.id);

        if (!result.ok) {
          return res.status(result.status).json({ error: result.error });
        }

        res.json(result.data);
      }
    } catch (error) {
      registerLog(logger, 'error', 'Error al crear la partida.', { error: error.message });
      res.status(500).json({ error: 'Error al crear la partida.' });
    }
  }

  #registrarRutas() {
    /**
     * @swagger
     * /api/partidas:
     *   get:
     *     summary: Lista todas las partidas disponibles
     *     tags:
     *       - Partidas
     *     responses:
     *       200:
     *         description: Lista de partidas
     *         content:
     *           application/json:
     *             schema:
     *               type: array
     *               items:
     *                 type: object
     *   post:
     *     summary: Crea una nueva partida
     *     tags:
     *       - Partidas
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             properties:
     *               jugadorId:
     *                 type: string
     *               maxJugadores:
     *                 type: integer
     *               cantidadBots:
     *                 type: integer
     *     responses:
     *       201:
     *         description: Partida creada
     *       400:
     *         description: Error en los datos enviados
     */
    this.router.get('/', (req, res) => this.listar(req, res));
    this.router.post('/', (req, res) => this.crear(req, res));

    /**
     * @swagger
     * /api/partidas/{id}:
     *   get:
     *     summary: Obtiene una partida por ID
     *     tags:
     *       - Partidas
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: ID de la partida
     *     responses:
     *       200:
     *         description: Datos de la partida
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *       404:
     *         description: Partida no encontrada
     */
    this.router.get('/:id', (req, res) => this.obtener(req, res));
  }
}

module.exports = ManejadorPartidas;

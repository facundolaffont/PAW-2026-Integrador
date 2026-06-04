const express = require('express');
const logger = require('../../logger');
const { registerLog, logContext } = require('../../utils');

class ManejadorPartidas {
  constructor(controller) {
    logContext(logger, this);
    this.controller = controller;

    this.router = express.Router();

    this.#registrarRutas();
  }

  listar(req, res) {
    logContext(logger, this);

    res.json(this.controller.listarPartidas());
  }

  /**
   * Crea una nueva partida con los datos recibidos en el cuerpo de la solicitud.
   * Registra logs con el contexto del método y los datos recibidos, y maneja errores
   * registrando el error y enviando una respuesta de error al cliente.
   *
   * @param {object} logger - El objeto logger para registrar los logs.
   * @param {object} this - El contexto del manejador de partidas.
   * @param {object} req - El objeto de solicitud HTTP, que contiene el cuerpo con los datos de la partida a crear.
   * @param {object} res - El objeto de respuesta HTTP, utilizado para enviar la respuesta al cliente.
   * @returns {void}
   */
  async crear(req, res) {
    try {
      logContext(logger, this);

      const jugadorId = req.jugadorId;
      const { maxJugadores, cantidadBots } = req.body;

      registerLog(logger, 'debug', 'Creando partida.', {
        jugadorId,
        maxJugadores,
        cantidadBots,
      });
      const result = await this.controller.crearPartida(jugadorId, maxJugadores, cantidadBots);

      if (!result.ok) {
        return res.status(result.status).json({ error: result.error });
      }

      res.status(201).json(result.data);
    } catch (error) {
      registerLog(logger, 'error', 'Error al crear la partida.', { error: error.message });
      res.status(500).json({ error: 'Error al crear la partida.' });
    }
  }

  obtener(req, res) {
    logContext(logger, this);
    const result = this.controller.obtenerPartida(req.params.id);

    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }

    res.json(result.data);
  }

  #registrarRutas() {
    logContext(logger, this);
    this.router.get('/', (req, res) => this.listar(req, res));
    this.router.post('/', (req, res) => this.crear(req, res));
    this.router.get('/:id', (req, res) => this.obtener(req, res));
  }
}

module.exports = ManejadorPartidas;

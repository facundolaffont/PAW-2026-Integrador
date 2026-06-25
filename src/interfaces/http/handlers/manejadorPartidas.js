const express = require('express');
const logger = require('#infraestructura/shared/logger');

/**
 * Manejador HTTP de la API REST de partidas. Expone endpoints para listar,
 * crear y obtener partidas por ID. Extrae datos del request (jugador autenticado,
 * parámetros y cuerpo), delega en PartidaController y traduce el resultado
 * en respuestas JSON con el código HTTP correspondiente.
 *
 * Endpoints (montado en `/api/partidas`, requiere autenticación):
 * - `GET /api/partidas` — lista las partidas activas.
 * - `POST /api/partidas` — crea una nueva partida.
 * - `GET /api/partidas/:id` — obtiene el estado de una partida.
 *
 * @param {import('#controladores/PartidaController')} controller - Controlador de lógica de partidas.
 */
class ManejadorPartidas {
  constructor(controller) {
    logger.logContext(this);
    this.controller = controller;

    this.router = express.Router();

    this.#registrarRutas();
  }

  /**
   * Lista todas las partidas activas.
   *
   * @param {import('express').Request} req - Objeto de solicitud de Express.
   * @param {import('express').Response} res - Objeto de respuesta de Express.
   * @returns {void}
   */
  listar(req, res) {
    logger.logContext(this);

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
   * @returns {Promise<void>}
   */
  async crear(req, res) {
    try {
      logger.logContext(this);

      const jugadorId = req.jugadorId;
      const { maxJugadores, cantidadBots } = req.body;

      logger.registerLog('debug', 'Creando partida.', {
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
      logger.registerLog('error', 'Error al crear la partida.', { error: error.message });
      res.status(500).json({ error: 'Error al crear la partida.' });
    }
  }

  /**
   * Obtiene el estado de una partida por su ID.
   *
   * @param {import('express').Request} req - Objeto de solicitud de Express.
   * @param {import('express').Response} res - Objeto de respuesta de Express.
   * @returns {void}
   */
  obtener(req, res) {
    logger.logContext(this);
    const result = this.controller.obtenerPartida(req.params.id, req.jugadorId);

    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }

    res.json(result.data);
  }

  #registrarRutas() {
    logger.logContext(this);
    this.router.get('/', (req, res) => this.listar(req, res));
    this.router.post('/', (req, res) => this.crear(req, res));
    this.router.get('/:id', (req, res) => this.obtener(req, res));
  }
}

module.exports = ManejadorPartidas;

const logger = require('../logger');
const { logContext } = require('../utils');

class ManejadorConexiones {
  /**
   * @type {Map<number, WebSocket>} conexiones - Mapa que asocia cada jugadorId con su conexión WebSocket activa.
   * Permite enviar mensajes a jugadores específicos o a grupos de jugadores mediante sus IDs.
   */
  conexiones;

  constructor() {
    logContext(logger, this);
    this.conexiones = new Map();
  }

  /**
   * Guarda en memoria la conexión WebSocket de un jugador.
   *
   * @param {Number} jugadorId - Identificador numérico del jugador.
   * @param {WebSocket} webSocket - Instancia de conexión WebSocket.
   */
  registrar(jugadorId, webSocket) {
    logContext(logger, this);
    this.conexiones.set(jugadorId, webSocket);
  }

  /**
   * Elimina de memoria la conexión WebSocket de un jugador.
   *
   * @param {Number} jugadorId - Identificador numérico del jugador.
   */
  desregistrar(jugadorId) {
    logContext(logger, this);
    this.conexiones.delete(jugadorId);
  }

  /**
   * Envía un mensaje a un jugador específico.
   *
   * @param {Number} jugadorId - Identificador numérico del jugador.
   * @param {String} evento - Descripción del evento a comunicar.
   * @param {Object} datos - Datos del evento.
   */
  emitirA(jugadorId, evento, datos) {
    logContext(logger, this);

    const webSocket = this.conexiones.get(jugadorId);

    if (webSocket?.readyState === 1) {
      webSocket.send(JSON.stringify({ evento, ...datos }));
    }
  }

  /**
   * Envía un mensaje a todos los jugadores especificados.
   *
   * @param {Array<Number>} jugadoresIds - Lista de identificadores numéricos de los jugadores.
   * @param {String} evento - Descripción del evento a comunicar.
   * @param {Object} datos - Datos del evento.
   */
  emitirATodos(jugadoresIds, evento, datos) {
    logContext(logger, this);

    for (const jugadorId of jugadoresIds) {
      this.emitirA(jugadorId, evento, datos);
    }
  }
}

module.exports = ManejadorConexiones;

const logger = require('../logger');
const { logContext } = require('../utils');

class ManejadorConexiones {
  constructor() {
    logContext(logger, this);
    this.conexiones = new Map();
  }

  registrar(jugadorId, ws) {
    logContext(logger, this);
    this.conexiones.set(jugadorId, ws);
  }

  desregistrar(jugadorId) {
    logContext(logger, this);
    this.conexiones.delete(jugadorId);
  }

  emitirA(jugadorId, evento, datos) {
    logContext(logger, this);
    const ws = this.conexiones.get(jugadorId);

    if (ws?.readyState === 1) {
      ws.send(JSON.stringify({ evento, ...datos }));
    }
  }

  emitirATodos(jugadoresIds, evento, datos) {
    logContext(logger, this);
    for (const jugadorId of jugadoresIds) {
      this.emitirA(jugadorId, evento, datos);
    }
  }
}

module.exports = ManejadorConexiones;

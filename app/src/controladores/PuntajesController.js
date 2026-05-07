const logger = require('../logger');
const { logContext } = require('../utils');

class PuntajesController {
  constructor(persistencia) {
    logContext(logger, this);
    this.persistencia = persistencia;
  }

  async listarPuntajes() {
    logContext(logger, this);
    return this.persistencia.obtenerPuntajes();
  }
}

module.exports = PuntajesController;

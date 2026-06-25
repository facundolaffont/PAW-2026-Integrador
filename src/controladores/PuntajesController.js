const logger = require('#infraestructura/shared/logger');
const { logContext } = require('#infraestructura/shared/utils');

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

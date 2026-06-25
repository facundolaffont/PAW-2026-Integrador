const logger = require('#infraestructura/shared/logger');
class PuntajesController {
  constructor(persistencia) {
    logger.logContext(this);
    this.persistencia = persistencia;
  }

  async listarPuntajes() {
    logger.logContext(this);
    return this.persistencia.obtenerPuntajes();
  }
}

module.exports = PuntajesController;

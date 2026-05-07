const logger = require('../logger');
const { logContext } = require('../utils');

class Usuario {
  constructor(jugadorId, nombreUsuario) {
    logContext(logger, this);
    this.jugadorId = jugadorId;
    this.nombreUsuario = nombreUsuario;
  }
}

module.exports = Usuario;

const logger = require('../logger');
const { logContext } = require('../utils');

class Usuario {
  constructor(jugadorId, nombreUsuario, passwordHash) {
    logContext(logger, this);
    this.jugadorId = jugadorId;
    this.nombreUsuario = nombreUsuario;
    this.passwordHash = passwordHash;
  }
}

module.exports = Usuario;

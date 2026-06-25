const logger = require('#infraestructura/shared/logger');
const { logContext } = require('#infraestructura/shared/utils');

class Usuario {
  constructor(jugadorId, nombreUsuario, passwordHash) {
    logContext(logger, this);
    this.jugadorId = jugadorId;
    this.nombreUsuario = nombreUsuario;
    this.passwordHash = passwordHash;
  }
}

module.exports = Usuario;

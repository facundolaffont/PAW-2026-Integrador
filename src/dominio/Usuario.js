const logger = require('#infraestructura/shared/logger');
class Usuario {
  constructor(jugadorId, nombreUsuario, passwordHash) {
    logger.logContext(this);
    this.jugadorId = jugadorId;
    this.nombreUsuario = nombreUsuario;
    this.passwordHash = passwordHash;
  }
}

module.exports = Usuario;

const logger = require('#infraestructura/shared/logger');
class JugadorEnSala {
  constructor(jugadorId, nombreUsuario, esBot = false) {
    logger.logContext(this);
    this.jugadorId = jugadorId;
    this.nombreUsuario = nombreUsuario;
    this.mano = [];
    this.esBot = esBot;
    this.canto = false;
  }

  recibirCartas(cartas) {
    logger.logContext(this);
    this.mano.push(...cartas);
  }

  quitarCarta(cartaId) {
    logger.logContext(this);
    const idx = this.mano.findIndex((c) => c.getId() === cartaId);
    if (idx === -1) return null;
    return this.mano.splice(idx, 1)[0];
  }

  reiniciarMano() {
    logger.logContext(this);
    this.mano = [];
    this.canto = false;
  }

  get cantidadCartas() {
    logger.logContext(this);
    return this.mano.length;
  }

  get gano() {
    logger.logContext(this);
    return this.mano.length === 0;
  }
}

module.exports = JugadorEnSala;

const logger = require('../logger');
const { logContext } = require('../utils');

class JugadorEnSala {
  constructor(jugadorId, nombreUsuario, esBot = false) {
    logContext(logger, this);
    this.jugadorId = jugadorId;
    this.nombreUsuario = nombreUsuario;
    this.mano = [];
    this.cantóUno = false;
    this.esBot = esBot;
  }

  recibirCartas(cartas) {
    logContext(logger, this);
    this.mano.push(...cartas);
  }

  quitarCarta(cartaId) {
    logContext(logger, this);
    const idx = this.mano.findIndex((c) => c.id === cartaId);
    if (idx === -1) return null;
    return this.mano.splice(idx, 1)[0];
  }

  reiniciarMano() {
    logContext(logger, this);
    this.mano = [];
    this.cantóUno = false;
  }

  get cantidadCartas() {
    logContext(logger, this);
    return this.mano.length;
  }

  get tieneUna() {
    logContext(logger, this);
    return this.mano.length === 1;
  }

  get gano() {
    logContext(logger, this);
    return this.mano.length === 0;
  }
}

module.exports = JugadorEnSala;

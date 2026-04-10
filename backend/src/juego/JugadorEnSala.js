class JugadorEnSala {
  constructor(jugadorId, nombreUsuario, esBot = false) {
    this.jugadorId = jugadorId;
    this.nombreUsuario = nombreUsuario;
    this.mano = [];
    this.cantóUno = false;
    this.esBot = esBot;
  }

  recibirCartas(cartas) {
    this.mano.push(...cartas);
  }

  quitarCarta(cartaId) {
    const idx = this.mano.findIndex((c) => c.id === cartaId);
    if (idx === -1) return null;
    return this.mano.splice(idx, 1)[0];
  }

  reiniciarMano() {
    this.mano = [];
    this.cantóUno = false;
  }

  get cantidadCartas() {
    return this.mano.length;
  }

  get tieneUna() {
    return this.mano.length === 1;
  }

  get gano() {
    return this.mano.length === 0;
  }
}

module.exports = JugadorEnSala;

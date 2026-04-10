class Jugador {
  constructor(jugadorId, nombreUsuario) {
    this.jugadorId = jugadorId;
    this.nombreUsuario = nombreUsuario;
    this.puntajeGlobal = 0;
  }

  ajustarPuntaje(delta) {
    this.puntajeGlobal = Math.max(0, this.puntajeGlobal + delta);
  }
}

module.exports = Jugador;

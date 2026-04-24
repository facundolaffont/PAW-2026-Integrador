const Jugador = require('../../modelo/Jugador');

class JugadorRepositorioMemoria {
  constructor() {
    this.jugadores = new Map();
    this.puntajes = new Map();
  }

  async registrarJugador(jugadorId, nombreUsuario) {
    const jugador = new Jugador(jugadorId, nombreUsuario);

    this.jugadores.set(jugadorId, jugador);

    this.puntajes.set(jugadorId, 0);

    return jugador;
  }

  async obtenerJugador(jugadorId) {
    return this.jugadores.get(jugadorId) || null;
  }

  async obtenerJugadorPorNombre(nombreUsuario) {
    for (const jugador of this.jugadores.values()) {
      if (jugador.nombreUsuario === nombreUsuario) return jugador;
    }

    return null;
  }

  async obtenerPuntajes() {
    return [...this.jugadores.values()]
      .map((j) => ({
        jugadorId: j.jugadorId,
        nombreUsuario: j.nombreUsuario,
        puntajeGlobal: this.puntajes.get(j.jugadorId) || 0,
      }))
      .sort((a, b) => b.puntajeGlobal - a.puntajeGlobal);
  }

  async guardarResultadoPartida(_partidaId, ranking) {
    for (const rank of ranking) {
      if (rank.jugadorId.startsWith('bot-')) continue;

      const actual = this.puntajes.get(rank.jugadorId) || 0;

      this.puntajes.set(rank.jugadorId, actual + rank.deltaGlobal);
    }
  }
}

module.exports = new JugadorRepositorioMemoria();

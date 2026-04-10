const Jugador = require('../juego/Jugador');

class Persistencia {
  constructor() {
    this.jugadores = new Map();
    this.partidas = new Map();
  }

  registrarJugador(jugadorId, nombreUsuario) {
    const jugador = new Jugador(jugadorId, nombreUsuario);
    this.jugadores.set(jugadorId, jugador);
    return jugador;
  }

  obtenerJugador(jugadorId) {
    return this.jugadores.get(jugadorId) || null;
  }

  obtenerJugadorPorNombre(nombreUsuario) {
    for (const jugador of this.jugadores.values()) {
      if (jugador.nombreUsuario === nombreUsuario) return jugador;
    }
    return null;
  }

  ajustarPuntajeGlobal(jugadorId, delta) {
    const jugador = this.jugadores.get(jugadorId);
    if (jugador) jugador.ajustarPuntaje(delta);
  }

  obtenerPuntajes() {
    return [...this.jugadores.values()]
      .sort((a, b) => b.puntajeGlobal - a.puntajeGlobal)
      .map(({ nombreUsuario, puntajeGlobal }) => ({ nombreUsuario, puntajeGlobal }));
  }

  guardarPartida(partidaId, sala) {
    this.partidas.set(partidaId, sala);
  }

  obtenerPartida(partidaId) {
    return this.partidas.get(partidaId) || null;
  }

  eliminarPartida(partidaId) {
    this.partidas.delete(partidaId);
  }

  listarPartidasDisponibles() {
    return [...this.partidas.values()]
      .filter((s) => s.estado === 'esperando')
      .map((s) => s.resumenPublico());
  }
}

module.exports = new Persistencia();

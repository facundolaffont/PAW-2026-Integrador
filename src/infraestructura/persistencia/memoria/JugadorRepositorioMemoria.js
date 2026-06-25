const Usuario = require('#dominio/Usuario');
const logger = require('#infraestructura/shared/logger');
class JugadorRepositorioMemoria {
  constructor() {
    logger.logContext(this);
    this.jugadores = new Map();
    this.puntajes = new Map();
  }

  async registrarJugador(jugadorId, nombreUsuario, passwordHash) {
    logger.logContext(this);
    const jugador = new Usuario(jugadorId, nombreUsuario, passwordHash);

    this.jugadores.set(jugadorId, jugador);
    this.puntajes.set(jugadorId, 0);

    return jugador;
  }

  async obtenerJugador(jugadorId) {
    logger.logContext(this);
    return this.jugadores.get(jugadorId) || null;
  }

  async obtenerJugadorPorNombre(nombreUsuario) {
    logger.logContext(this);
    for (const jugador of this.jugadores.values()) {
      if (jugador.nombreUsuario === nombreUsuario) return jugador;
    }

    return null;
  }

  async obtenerPuntajes() {
    logger.logContext(this);
    return [...this.jugadores.values()]
      .map((j) => ({
        jugadorId: j.jugadorId,
        nombreUsuario: j.nombreUsuario,
        puntajeGlobal: this.puntajes.get(j.jugadorId) || 0,
      }))
      .sort((a, b) => b.puntajeGlobal - a.puntajeGlobal);
  }

  async guardarResultadoPartida(_partidaId, ranking) {
    logger.logContext(this);
    for (const rank of ranking) {
      if (rank.jugadorId.startsWith('bot-')) continue;

      const actual = this.puntajes.get(rank.jugadorId) || 0;
      this.puntajes.set(rank.jugadorId, actual + rank.deltaGlobal);
    }
  }
}

module.exports = new JugadorRepositorioMemoria();

const repo = process.env.DB_HOST
  ? require('./mysql/JugadorRepositorioMySQL')
  : require('./memoria/JugadorRepositorioMemoria');
const logger = require('../logger');
const { logContext } = require('../utils');

class Persistencia {
  constructor() {
    logContext(logger, this);
    this.partidas = new Map();
    this.jugadoresLogueados = new Set();
  }

  // ─── Jugadores (delegado al repositorio) ─────────────────────────────────

  registrarJugador(jugadorId, nombreUsuario, passwordHash) {
    logContext(logger, this);
    return repo.registrarJugador(jugadorId, nombreUsuario, passwordHash);
  }

  obtenerJugador(jugadorId) {
    logContext(logger, this);
    return repo.obtenerJugador(jugadorId);
  }

  obtenerJugadorPorNombre(nombreUsuario) {
    logContext(logger, this);
    return repo.obtenerJugadorPorNombre(nombreUsuario);
  }

  obtenerPuntajes() {
    logContext(logger, this);
    return repo.obtenerPuntajes();
  }

  guardarResultadoPartida(partidaId, ranking) {
    logContext(logger, this);
    return repo.guardarResultadoPartida(partidaId, ranking);
  }

  // ─── Partidas activas (en memoria) ───────────────────────────────────────

  guardarPartida(partidaId, sala) {
    logContext(logger, this);
    this.partidas.set(partidaId, sala);
  }

  obtenerPartida(partidaId) {
    logContext(logger, this);
    return this.partidas.get(partidaId) || null;
  }

  eliminarPartida(partidaId) {
    logContext(logger, this);
    this.partidas.delete(partidaId);
  }

  listarPartidasDisponibles() {
    logContext(logger, this);
    return [...this.partidas.values()]
      .filter((s) => s.estado === 'esperando')
      .map((s) => s.resumenPublico());
  }

  jugadorEstaEnPartida(jugadorId) {
    logContext(logger, this);
    for (const sala of this.partidas.values()) {
      if (sala.jugadores.some((j) => !j.esBot && j.jugadorId === jugadorId)) {
        return true;
      }
    }
    return false;
  }

  marcarJugadorLogueado(jugadorId) {
    logContext(logger, this);
    this.jugadoresLogueados.add(jugadorId);
  }

  desmarcarJugadorLogueado(jugadorId) {
    logContext(logger, this);
    this.jugadoresLogueados.delete(jugadorId);
  }

  jugadorEstaLogueado(jugadorId) {
    //logContext(logger, this);
    return this.jugadoresLogueados.has(jugadorId);
  }
}

module.exports = new Persistencia();

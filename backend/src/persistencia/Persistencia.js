const repo = process.env.DB_HOST
  ? require('./mysql/JugadorRepositorioMySQL')
  : require('./memoria/JugadorRepositorioMemoria');

class Persistencia {
  constructor() {
    this.partidas = new Map();
  }

  // ─── Jugadores (delegado al repositorio) ─────────────────────────────────

  registrarJugador(jugadorId, nombreUsuario) {
    return repo.registrarJugador(jugadorId, nombreUsuario);
  }

  obtenerJugador(jugadorId) {
    return repo.obtenerJugador(jugadorId);
  }

  obtenerJugadorPorNombre(nombreUsuario) {
    return repo.obtenerJugadorPorNombre(nombreUsuario);
  }

  obtenerPuntajes() {
    return repo.obtenerPuntajes();
  }

  guardarResultadoPartida(partidaId, ranking) {
    return repo.guardarResultadoPartida(partidaId, ranking);
  }

  // ─── Partidas activas (en memoria) ───────────────────────────────────────

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

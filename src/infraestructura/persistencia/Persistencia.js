const logger = require('#infraestructura/shared/logger');
/** @typedef {import('../../dominio/Usuario')} Usuario */

class Persistencia {
  /** @type {Map<string, Sala>} partidas - Mapa de partidas activas en memoria, indexadas por su ID. */
  partidas;

  /** Interfaz para JugadorRepositorioMySQL y JugadorRepositorioMemoria. */
  repositorio;

  constructor() {
    logger.logContext(this);
    this.repositorio = process.env.DB_HOST
      ? require('#infraestructura/persistencia/mysql/JugadorRepositorioMySQL')
      : require('#infraestructura/persistencia/memoria/JugadorRepositorioMemoria');
    this.partidas = new Map();
  }

  // ─── Jugadores (delegado al repositorio) ─────────────────────────────────

  registrarJugador(jugadorId, nombreUsuario, passwordHash) {
    logger.logContext(this);
    return this.repositorio.registrarJugador(jugadorId, nombreUsuario, passwordHash);
  }

  /**
   * Obtiene la instancia de un jugador a partir de su ID.
   *
   * Utiliza:
   * - this.repositorio.
   *
   * @param {Number} jugadorId Identificador numérico del jugador cuya instancia quiere obtenerse.
   * @returns {Usuario|null} Instancia del jugador o null si no existe.
   */
  obtenerJugador(jugadorId) {
    logger.logContext(this);
    return this.repositorio.obtenerJugador(jugadorId);
  }

  /**
   * Obtiene la instancia de un jugador a partir de su nombre de usuario.
   *
   * @param {String} nombreUsuario - Nombre de usuario del jugador cuya instancia desea obtenerse.
   * @returns {Usuario|null} - Instancia del jugador o null si no existe.
   */
  obtenerJugadorPorNombre(nombreUsuario) {
    logger.logContext(this);
    return this.repositorio.obtenerJugadorPorNombre(nombreUsuario);
  }

  obtenerPuntajes() {
    logger.logContext(this);
    return this.repositorio.obtenerPuntajes();
  }

  guardarResultadoPartida(partidaId, ranking) {
    logger.logContext(this);
    return this.repositorio.guardarResultadoPartida(partidaId, ranking);
  }

  // ─── Partidas activas (en memoria) ───────────────────────────────────────

  /**
   * Guarda el estado de una partida activa en memoria.
   *
   * @param {Number} partidaId - Identificador numérico de la partida.
   * @param {SalaDeJuego} sala - Instancia de la sala de juego.
   */
  guardarPartida(partidaId, sala) {
    logger.logContext(this);

    this.partidas.set(partidaId, sala);
  }

  /**
   * Obtiene la instancia de una partida activa, si existe.
   *
   * @param {Number} partidaId - Identificador numérico de la partida.
   * @returns {SalaDeJuego|null} - Instancia de la sala de juego o null si no existe.
   */
  obtenerPartida(partidaId) {
    logger.logContext(this);
    return this.partidas.get(partidaId) || null;
  }

  eliminarPartida(partidaId) {
    logger.logContext(this);
    this.partidas.delete(partidaId);
  }

  listarPartidasDisponibles() {
    logger.logContext(this);
    return [...this.partidas.values()]
      .filter((s) => s.estado === 'esperando')
      .map((s) => s.resumenPublico());
  }

  jugadorEstaEnPartida(jugadorId) {
    logger.logContext(this);
    for (const sala of this.partidas.values()) {
      if (sala.jugadores.some((j) => !j.esBot && j.jugadorId === jugadorId)) {
        return true;
      }
    }
    return false;
  }

}

module.exports = new Persistencia();

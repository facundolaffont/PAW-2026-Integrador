const pool = require('#infraestructura/persistencia/mysql/conexion');
const Usuario = require('#dominio/Usuario');
const logger = require('#infraestructura/shared/logger');
class JugadorRepositorioMySQL {
  async registrarJugador(jugadorId, nombreUsuario, passwordHash) {
    logger.logContext(this);
    await pool.execute(
      'INSERT INTO jugadores (id, nombre_usuario, password_hash) VALUES (?, ?, ?)',
      [jugadorId, nombreUsuario, passwordHash]
    );

    return new Usuario(jugadorId, nombreUsuario, passwordHash);
  }

  /**
   * Obtiene la instancia de un jugador a partir de su ID.
   *
   * @param {Number} jugadorId - Identificador numérico del jugador cuya instancia desea obtenerse.
   * @returns {Usuario|null} - Instancia del jugador o null si no existe.
   */
  async obtenerJugador(jugadorId) {
    logger.logContext(this);
    const [rows] = await pool.execute(
      'SELECT id, nombre_usuario, password_hash FROM jugadores WHERE id = ?',
      [jugadorId]
    );

    if (!rows.length) return null;

    return new Usuario(rows[0].id, rows[0].nombre_usuario, rows[0].password_hash);
  }

  /**
   * Obtiene la instancia de un jugador a partir de su nombre de usuario.
   *
   * @param {String} nombreUsuario - Nombre de usuario del jugador cuya instancia desea obtenerse.
   * @returns {Usuario|null} - Instancia del jugador o null si no existe.
   */
  async obtenerJugadorPorNombre(nombreUsuario) {
    logger.logContext(this);
    const [rows] = await pool.execute(
      'SELECT id, nombre_usuario, password_hash FROM jugadores WHERE nombre_usuario = ?',
      [nombreUsuario]
    );

    if (!rows.length) return null;

    return new Usuario(rows[0].id, rows[0].nombre_usuario, rows[0].password_hash);
  }

  async obtenerPuntajes() {
    logger.logContext(this);
    const [rows] = await pool.execute(`
      SELECT j.id AS jugadorId, j.nombre_usuario AS nombreUsuario,
             COALESCE(SUM(pj.delta_global), 0) AS puntajeGlobal
      FROM jugadores j
      LEFT JOIN partida_jugadores pj ON j.id = pj.jugador_id
      GROUP BY j.id, j.nombre_usuario
      ORDER BY puntajeGlobal DESC
    `);

    return rows;
  }

  async guardarResultadoPartida(partidaId, ranking) {
    logger.logContext(this);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      await conn.execute('INSERT INTO partidas (id, estado) VALUES (?, ?)', [
        partidaId,
        'terminada',
      ]);

      for (const r of ranking) {
        // No guardamos bots en el historial de puntajes
        if (r.jugadorId.startsWith('bot-')) continue;

        await conn.execute(
          'INSERT INTO partida_jugadores (partida_id, jugador_id, puesto, puntaje_ronda, delta_global) VALUES (?, ?, ?, ?, ?)',
          [partidaId, r.jugadorId, r.puesto, r.puntaje, r.deltaGlobal]
        );
      }

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }
}

module.exports = new JugadorRepositorioMySQL();

const pool = require('../mysql');
const Jugador = require('../../juego/Jugador');

class JugadorRepositorioMySQL {
  async registrarJugador(jugadorId, nombreUsuario) {
    await pool.execute('INSERT INTO jugadores (id, nombre_usuario) VALUES (?, ?)', [
      jugadorId,
      nombreUsuario,
    ]);

    return new Jugador(jugadorId, nombreUsuario);
  }

  async obtenerJugador(jugadorId) {
    const [rows] = await pool.execute('SELECT id, nombre_usuario FROM jugadores WHERE id = ?', [
      jugadorId,
    ]);

    if (!rows.length) return null;

    return new Jugador(rows[0].id, rows[0].nombre_usuario);
  }

  async obtenerJugadorPorNombre(nombreUsuario) {
    const [rows] = await pool.execute(
      'SELECT id, nombre_usuario FROM jugadores WHERE nombre_usuario = ?',
      [nombreUsuario]
    );

    if (!rows.length) return null;

    return new Jugador(rows[0].id, rows[0].nombre_usuario);
  }

  async obtenerPuntajes() {
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

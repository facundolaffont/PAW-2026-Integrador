const { v4: uuidv4 } = require('uuid');
const SalaDeJuego = require('../modelo/SalaDeJuego');

const NOMBRES_BOTS = ['Bot-A', 'Bot-B', 'Bot-C'];

class PartidaController {
  constructor(conexiones, persistencia, botLLM) {
    this.conexiones = conexiones;
    this.persistencia = persistencia;
    this.botLLM = botLLM;
  }

  // ─── HTTP ────────────────────────────────────────────────────────────────

  listarPartidas() {
    return this.persistencia.listarPartidasDisponibles();
  }

  async crearPartida(jugadorId, maxJugadores, cantidadBots = 0) {
    if (!jugadorId) return { ok: false, status: 400, error: 'jugadorId requerido' };

    const jugador = await this.persistencia.obtenerJugador(jugadorId);
    if (!jugador) return { ok: false, status: 404, error: 'Jugador no encontrado' };

    const bots = parseInt(cantidadBots);
    const total = 1 + bots;
    const max = maxJugadores ? parseInt(maxJugadores) : total;

    if (bots < 0 || bots > 3)
      return { ok: false, status: 400, error: 'cantidadBots debe ser entre 0 y 3' };

    if (total < 2 || total > 4)
      return {
        ok: false,
        status: 400,
        error: 'El total de jugadores (humanos + bots) debe ser entre 2 y 4',
      };

    const partidaId = uuidv4();
    const sala = new SalaDeJuego(partidaId, jugadorId, max);
    sala.agregarJugador(jugadorId, jugador.nombreUsuario);

    for (let i = 0; i < bots; i++) {
      sala.agregarBot(NOMBRES_BOTS[i]);
    }

    this.persistencia.guardarPartida(partidaId, sala);

    return { ok: true, data: { partidaId, ...sala.resumenPublico() } };
  }

  obtenerPartida(id) {
    const sala = this.persistencia.obtenerPartida(id);
    if (!sala) return { ok: false, status: 404, error: 'Partida no encontrada' };
    return { ok: true, data: sala.resumenPublico() };
  }

  // ─── WebSocket ───────────────────────────────────────────────────────────

  _broadcast(sala, evento, datos) {
    this.conexiones.emitirATodos(
      sala.jugadores.map((j) => j.jugadorId),
      evento,
      datos
    );
  }

  async unirJugador(partidaId, jugadorId) {
    const sala = this.persistencia.obtenerPartida(partidaId);

    if (!sala) {
      this.conexiones.emitirA(jugadorId, 'error', { mensaje: 'Partida no encontrada' });
      return { error: 'Partida no encontrada' };
    }

    const jugador = await this.persistencia.obtenerJugador(jugadorId);

    if (!jugador) {
      this.conexiones.emitirA(jugadorId, 'error', { mensaje: 'Jugador no encontrado' });
      return { error: 'Jugador no encontrado' };
    }

    if (!sala.jugadores.find((j) => j.jugadorId === jugadorId)) {
      const resultado = sala.agregarJugador(jugadorId, jugador.nombreUsuario);

      if (resultado.error) {
        this.conexiones.emitirA(jugadorId, 'error', { mensaje: resultado.error });
        return { error: resultado.error };
      }

      this._broadcast(sala, 'jugador-unido', {
        jugadorId,
        nombreUsuario: jugador.nombreUsuario,
        totalJugadores: sala.jugadores.length,
      });
    }

    this.conexiones.emitirA(jugadorId, 'estado-partida', {
      estado: sala.estadoParaJugador(jugadorId),
    });

    return { ok: true };
  }

  iniciarPartida(partidaId, jugadorId) {
    const sala = this.persistencia.obtenerPartida(partidaId);
    const res = sala.iniciar(jugadorId);

    if (res.error) {
      this.conexiones.emitirA(jugadorId, 'error', { mensaje: res.error });
      return;
    }

    for (const j of sala.jugadores) {
      this.conexiones.emitirA(j.jugadorId, 'estado-partida', {
        estado: sala.estadoParaJugador(j.jugadorId),
      });
    }

    this._broadcast(sala, 'turno-cambiado', {
      turno: sala.jugadorEnTurno().jugadorId,
      sentido: sala.sentido,
    });

    if (sala.turnoEsBot()) {
      this._ejecutarTurnoBot(partidaId);
    }
  }

  async jugarCarta(partidaId, jugadorId, cartaId, colorElegido) {
    const sala = this.persistencia.obtenerPartida(partidaId);
    const res = sala.jugarCarta(jugadorId, cartaId, colorElegido);

    if (res.error) {
      this.conexiones.emitirA(jugadorId, 'error', { mensaje: res.error });
      return;
    }

    if (res.partidaTerminada) {
      await this.persistencia.guardarResultadoPartida(partidaId, res.ranking);

      this._broadcast(sala, 'partida-terminada', { ranking: res.ranking });

      this.persistencia.eliminarPartida(partidaId);
      return;
    }

    if (res.rondaTerminada) {
      this._broadcast(sala, 'ronda-terminada', {
        ganadorRonda: res.ganadorRonda,
        puntosGanados: res.puntosGanados,
        puntajesRonda: res.puntajesRonda,
      });

      for (const j of sala.jugadores) {
        this.conexiones.emitirA(j.jugadorId, 'estado-partida', {
          estado: sala.estadoParaJugador(j.jugadorId),
        });
      }

      return;
    }

    this._broadcast(sala, 'carta-jugada', { jugadorId, carta: res.carta });

    this._broadcast(sala, 'turno-cambiado', {
      turno: sala.jugadorEnTurno().jugadorId,
      sentido: sala.sentido,
      penalidad: sala.penalidad,
    });

    if (sala.turnoEsBot()) {
      this._ejecutarTurnoBot(partidaId);
    }
  }

  robarCarta(partidaId, jugadorId) {
    const sala = this.persistencia.obtenerPartida(partidaId);
    const res = sala.robarCarta(jugadorId);

    if (res.error) {
      this.conexiones.emitirA(jugadorId, 'error', { mensaje: res.error });
      return;
    }

    this.conexiones.emitirA(jugadorId, 'cartas-robadas', { cartasRobadas: res.cartasRobadas });
    this._broadcast(sala, 'turno-cambiado', {
      turno: sala.jugadorEnTurno().jugadorId,
      sentido: sala.sentido,
      penalidad: 0,
      robó: { jugadorId, cantidad: res.cantidad },
    });

    if (sala.turnoEsBot()) {
      this._ejecutarTurnoBot(partidaId);
    }
  }

  cantarUno(partidaId, jugadorId) {
    const sala = this.persistencia.obtenerPartida(partidaId);
    const jugador = sala.jugadores.find((j) => j.jugadorId === jugadorId);
    const res = sala.cantarUno(jugadorId);

    if (res.error) {
      this.conexiones.emitirA(jugadorId, 'error', { mensaje: res.error });
      return;
    }

    this._broadcast(sala, 'uno-cantado', { jugadorId, nombreUsuario: jugador.nombreUsuario });
  }

  denunciarUno(partidaId, jugadorId, acusadoId) {
    const sala = this.persistencia.obtenerPartida(partidaId);
    const res = sala.denunciarUno(jugadorId, acusadoId);

    if (res.error) {
      this.conexiones.emitirA(jugadorId, 'error', { mensaje: res.error });
      return;
    }

    this._broadcast(sala, 'uno-denunciado', { denuncianteId: jugadorId, acusado: res.acusado });
  }

  desconectar(partidaId, jugadorId) {
    const sala = this.persistencia.obtenerPartida(partidaId);

    if (!sala || sala.estado === 'terminada') return;

    const info = sala.jugadorAbandonó(jugadorId);

    this._broadcast(sala, 'jugador-abandono', {
      jugadorId,
      nombreUsuario: info.nombreUsuario,
      mensaje: 'La partida fue cancelada por abandono',
    });

    this.persistencia.eliminarPartida(partidaId);
  }

  async _ejecutarTurnoBot(partidaId) {
    const sala = this.persistencia.obtenerPartida(partidaId);
    if (!sala || !sala.turnoEsBot()) return;

    await new Promise((r) => setTimeout(r, 1200));

    const salaActual = this.persistencia.obtenerPartida(partidaId);
    if (!salaActual || !salaActual.turnoEsBot()) return;

    const bot = salaActual.jugadorEnTurno();

    try {
      const { mano, cartaEnMesa, penalidad, tipoPenalidad, rivales } = salaActual.estadoParaBot();
      const decision = await this.botLLM.decidirJugada(
        mano,
        cartaEnMesa,
        penalidad,
        tipoPenalidad,
        rivales
      );

      if (decision.robar) {
        const res = salaActual.robarCarta(bot.jugadorId);

        if (res.error) {
          console.error('[Bot] Error al robar:', res.error);
          return;
        }

        this._broadcast(salaActual, 'turno-cambiado', {
          turno: salaActual.jugadorEnTurno().jugadorId,
          sentido: salaActual.sentido,
          penalidad: 0,
          robó: { jugadorId: bot.jugadorId, cantidad: res.cantidad },
        });
      } else {
        const res = salaActual.jugarCarta(bot.jugadorId, decision.cartaId, decision.colorElegido);

        if (res.error) {
          console.error('[Bot] Jugada inválida, forzando robo:', res.error);
          const resRobo = salaActual.robarCarta(bot.jugadorId);
          this._broadcast(salaActual, 'turno-cambiado', {
            turno: salaActual.jugadorEnTurno().jugadorId,
            sentido: salaActual.sentido,
            penalidad: 0,
            robó: { jugadorId: bot.jugadorId, cantidad: resRobo.cantidad },
          });
        } else if (res.partidaTerminada) {
          await this.persistencia.guardarResultadoPartida(partidaId, res.ranking);
          this._broadcast(salaActual, 'partida-terminada', { ranking: res.ranking });
          this.persistencia.eliminarPartida(partidaId);
          return;
        } else if (res.rondaTerminada) {
          this._broadcast(salaActual, 'ronda-terminada', {
            ganadorRonda: res.ganadorRonda,
            puntosGanados: res.puntosGanados,
            puntajesRonda: res.puntajesRonda,
          });
          for (const j of salaActual.jugadores) {
            this.conexiones.emitirA(j.jugadorId, 'estado-partida', {
              estado: salaActual.estadoParaJugador(j.jugadorId),
            });
          }
          return;
        } else {
          if (bot.mano.length === 1) {
            salaActual.cantarUno(bot.jugadorId);
            this._broadcast(salaActual, 'uno-cantado', {
              jugadorId: bot.jugadorId,
              nombreUsuario: bot.nombreUsuario,
            });
          }
          this._broadcast(salaActual, 'carta-jugada', {
            jugadorId: bot.jugadorId,
            carta: res.carta,
          });
          this._broadcast(salaActual, 'turno-cambiado', {
            turno: salaActual.jugadorEnTurno().jugadorId,
            sentido: salaActual.sentido,
            penalidad: salaActual.penalidad,
          });
        }
      }
    } catch (err) {
      console.error('[Bot] Error inesperado:', err);
    }

    if (salaActual.turnoEsBot()) {
      this._ejecutarTurnoBot(partidaId);
    }
  }
}

module.exports = PartidaController;

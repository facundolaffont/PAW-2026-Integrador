const db = require('../db/Persistencia');
const BotLLM = require('../juego/BotLLM');

class ManejadorPartida {
  constructor() {
    this.conexiones = new Map();
    this.botLLM = new BotLLM();
  }

  // ─── Emision de eventos ──────────────────────────────────────────────────

  _emitirATodos(sala, evento, datos) {
    for (const jugador of sala.jugadores) {
      this._emitirA(jugador.jugadorId, evento, datos);
    }
  }

  _emitirA(jugadorId, evento, datos) {
    const ws = this.conexiones.get(jugadorId);

    if (ws?.readyState === 1) {
      ws.send(JSON.stringify({ evento, ...datos }));
    }
  }

  // ─── Conexion WebSocket ──────────────────────────────────────────────────

  async manejarConexion(ws, jugadorId, partidaId) {
    this.conexiones.set(jugadorId, ws);

    const sala = db.obtenerPartida(partidaId);

    if (!sala) {
      ws.send(JSON.stringify({ evento: 'error', mensaje: 'Partida no encontrada' }));
      ws.close();
      return;
    }

    const jugador = await db.obtenerJugador(jugadorId);

    if (!jugador) {
      ws.send(JSON.stringify({ evento: 'error', mensaje: 'Jugador no encontrado' }));
      ws.close();
      return;
    }

    if (!sala.jugadores.find((j) => j.jugadorId === jugadorId)) {
      const resultado = sala.agregarJugador(jugadorId, jugador.nombreUsuario);

      if (resultado.error) {
        ws.send(JSON.stringify({ evento: 'error', mensaje: resultado.error }));
        ws.close();
        return;
      }

      this._emitirATodos(sala, 'jugador-unido', {
        jugadorId,
        nombreUsuario: jugador.nombreUsuario,
        totalJugadores: sala.jugadores.length,
      });
    }

    ws.send(
      JSON.stringify({ evento: 'estado-partida', estado: sala.estadoParaJugador(jugadorId) })
    );

    ws.on('message', async (raw) => {
      let mensaje;

      try {
        mensaje = JSON.parse(raw);
      } catch {
        return;
      }

      const { accion, ...payload } = mensaje;

      try {
        switch (accion) {
          case 'iniciar-partida':
            this._iniciarPartida(sala, jugadorId, partidaId);
            break;
          case 'jugar-carta':
            await this._jugarCarta(sala, jugadorId, partidaId, payload);
            break;
          case 'robar-carta':
            this._robarCarta(sala, jugadorId, partidaId);
            break;
          case 'cantar-uno':
            this._cantarUno(sala, jugadorId, jugador);
            break;
          case 'denunciar-uno':
            this._denunciarUno(sala, jugadorId, payload);
            break;
          default:
            this._emitirA(jugadorId, 'error', { mensaje: `Acción desconocida: ${accion}` });
        }
      } catch (err) {
        console.error('[WS] Error procesando mensaje:', err);
      }
    });

    ws.on('close', () => {
      this.conexiones.delete(jugadorId);

      const salaActual = db.obtenerPartida(partidaId);

      if (!salaActual || salaActual.estado === 'terminada') return;

      const info = salaActual.jugadorAbandonó(jugadorId);

      // Evento para el frontend: notifica a todos los jugadores que la partida fue cancelada
      this._emitirATodos(salaActual, 'jugador-abandono', {
        jugadorId,
        nombreUsuario: info.nombreUsuario,
        mensaje: 'La partida fue cancelada por abandono',
      });

      db.eliminarPartida(partidaId);
    });
  }

  // ─── Turno del bot ───────────────────────────────────────────────────────

  async _ejecutarTurnoBot(sala, partidaId) {
    if (!sala.turnoEsBot()) return;

    const bot = sala.jugadorEnTurno();

    await new Promise((r) => setTimeout(r, 1200));

    if (!sala.turnoEsBot()) return;

    try {
      const { mano, cartaEnMesa, penalidad, tipoPenalidad, rivales } = sala.estadoParaBot();
      const decision = await this.botLLM.decidirJugada(
        mano,
        cartaEnMesa,
        penalidad,
        tipoPenalidad,
        rivales
      );

      if (decision.robar) {
        const res = sala.robarCarta(bot.jugadorId);
        if (res.error) {
          console.error('[Bot] Error al robar:', res.error);
          return;
        }
        this._emitirATodos(sala, 'turno-cambiado', {
          turno: sala.jugadorEnTurno().jugadorId,
          sentido: sala.sentido,
          penalidad: 0,
          robó: { jugadorId: bot.jugadorId, cantidad: res.cantidad },
        });
      } else {
        const res = sala.jugarCarta(bot.jugadorId, decision.cartaId, decision.colorElegido);

        if (res.error) {
          console.error('[Bot] Jugada inválida, forzando robo:', res.error);
          const resRobo = sala.robarCarta(bot.jugadorId);
          this._emitirATodos(sala, 'turno-cambiado', {
            turno: sala.jugadorEnTurno().jugadorId,
            sentido: sala.sentido,
            penalidad: 0,
            robó: { jugadorId: bot.jugadorId, cantidad: resRobo.cantidad },
          });
        } else if (res.partidaTerminada) {
          await db.guardarResultadoPartida(partidaId, res.ranking);
          this._emitirATodos(sala, 'partida-terminada', { ranking: res.ranking });
          db.eliminarPartida(partidaId);
          return;
        } else if (res.rondaTerminada) {
          this._emitirATodos(sala, 'ronda-terminada', {
            ganadorRonda: res.ganadorRonda,
            puntosGanados: res.puntosGanados,
            puntajesRonda: res.puntajesRonda,
          });
          for (const j of sala.jugadores) {
            this._emitirA(j.jugadorId, 'estado-partida', {
              estado: sala.estadoParaJugador(j.jugadorId),
            });
          }
          return;
        } else {
          if (bot.mano.length === 1) {
            sala.cantarUno(bot.jugadorId);

            this._emitirATodos(sala, 'uno-cantado', {
              jugadorId: bot.jugadorId,
              nombreUsuario: bot.nombreUsuario,
            });
          }
          this._emitirATodos(sala, 'carta-jugada', { jugadorId: bot.jugadorId, carta: res.carta });
          this._emitirATodos(sala, 'turno-cambiado', {
            turno: sala.jugadorEnTurno().jugadorId,
            sentido: sala.sentido,
            penalidad: sala.penalidad,
          });
        }
      }
    } catch (err) {
      console.error('[Bot] Error inesperado:', err);
    }

    if (sala.turnoEsBot()) {
      this._ejecutarTurnoBot(sala, partidaId);
    }
  }

  // ─── Acciones de jugadores humanos ───────────────────────────────────────

  _iniciarPartida(sala, jugadorId, partidaId) {
    const res = sala.iniciar(jugadorId);
    if (res.error) return this._emitirA(jugadorId, 'error', { mensaje: res.error });

    for (const j of sala.jugadores) {
      this._emitirA(j.jugadorId, 'estado-partida', { estado: sala.estadoParaJugador(j.jugadorId) });
    }

    this._emitirATodos(sala, 'turno-cambiado', {
      turno: sala.jugadorEnTurno().jugadorId,
      sentido: sala.sentido,
    });

    if (sala.turnoEsBot()) {
      this._ejecutarTurnoBot(sala, partidaId);
    }
  }

  async _jugarCarta(sala, jugadorId, partidaId, payload) {
    const { cartaId, colorElegido } = payload;

    const res = sala.jugarCarta(jugadorId, cartaId, colorElegido);

    if (res.error) return this._emitirA(jugadorId, 'error', { mensaje: res.error });

    if (res.partidaTerminada) {
      await db.guardarResultadoPartida(partidaId, res.ranking);

      this._emitirATodos(sala, 'partida-terminada', { ranking: res.ranking });

      db.eliminarPartida(partidaId);
      return;
    }

    if (res.rondaTerminada) {
      this._emitirATodos(sala, 'ronda-terminada', {
        ganadorRonda: res.ganadorRonda,
        puntosGanados: res.puntosGanados,
        puntajesRonda: res.puntajesRonda,
      });

      for (const j of sala.jugadores) {
        this._emitirA(j.jugadorId, 'estado-partida', {
          estado: sala.estadoParaJugador(j.jugadorId),
        });
      }

      return;
    }

    this._emitirATodos(sala, 'carta-jugada', { jugadorId, carta: res.carta });

    this._emitirATodos(sala, 'turno-cambiado', {
      turno: sala.jugadorEnTurno().jugadorId,
      sentido: sala.sentido,
      penalidad: sala.penalidad,
    });

    if (sala.turnoEsBot()) {
      this._ejecutarTurnoBot(sala, partidaId);
    }
  }

  _robarCarta(sala, jugadorId, partidaId) {
    const res = sala.robarCarta(jugadorId);

    if (res.error) return this._emitirA(jugadorId, 'error', { mensaje: res.error });

    this._emitirA(jugadorId, 'cartas-robadas', { cartasRobadas: res.cartasRobadas });

    this._emitirATodos(sala, 'turno-cambiado', {
      turno: sala.jugadorEnTurno().jugadorId,
      sentido: sala.sentido,
      penalidad: 0,
      robó: { jugadorId, cantidad: res.cantidad },
    });

    if (sala.turnoEsBot()) {
      this._ejecutarTurnoBot(sala, partidaId);
    }
  }

  _cantarUno(sala, jugadorId, jugador) {
    const res = sala.cantarUno(jugadorId);

    if (res.error) return this._emitirA(jugadorId, 'error', { mensaje: res.error });

    this._emitirATodos(sala, 'uno-cantado', { jugadorId, nombreUsuario: jugador.nombreUsuario });
  }

  _denunciarUno(sala, jugadorId, payload) {
    const { acusadoId } = payload;

    const res = sala.denunciarUno(jugadorId, acusadoId);

    if (res.error) return this._emitirA(jugadorId, 'error', { mensaje: res.error });

    this._emitirATodos(sala, 'uno-denunciado', { denuncianteId: jugadorId, acusado: res.acusado });
  }
}

module.exports = ManejadorPartida;

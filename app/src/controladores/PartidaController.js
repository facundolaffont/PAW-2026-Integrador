const { v4: uuidv4 } = require('uuid');
const SalaDeJuego = require('../modelo/SalaDeJuego');
const BotLLM = require('../modelo/BotLLM');
const ManejadorConexiones = require('../ws/manejadorConexiones');
const { registerLog, logContext } = require('../utils');

const NOMBRES_BOTS = ['Bot-A', 'Bot-B', 'Bot-C'];

const logger = require('../logger');

class PartidaController {
  constructor(conexiones, persistencia, botLLM) {
    logContext(logger, this);
    this.conexiones = conexiones;
    this.persistencia = persistencia;
    this.botLLM = botLLM;
    // Mapea `${partidaId}:${jugadorId}` → timeoutId del abandono diferido.
    // Si el jugador se reconecta antes de que expire, se cancela.
    this.desconexionesPendientes = new Map();
    this.GRACE_PERIOD_MS = 30000;
  }

  _claveDesconexion(partidaId, jugadorId) {
    return `${partidaId}:${jugadorId}`;
  }

  cancelarAbandonoPendiente(partidaId, jugadorId) {
    const clave = this._claveDesconexion(partidaId, jugadorId);
    const timeoutId = this.desconexionesPendientes.get(clave);
    if (timeoutId == null) return false;
    clearTimeout(timeoutId);
    this.desconexionesPendientes.delete(clave);
    return true;
  }

  listarPartidas() {
    logContext(logger, this);
    return this.persistencia.listarPartidasDisponibles();
  }

  obtenerPartida(id) {
    logContext(logger, this);
    const sala = this.persistencia.obtenerPartida(id);
    if (!sala) return { ok: false, status: 404, error: 'Partida no encontrada' };
    return { ok: true, data: sala.resumenPublico() };
  }

  iniciarPartida(partidaId, jugadorId) {
    logContext(logger, this);
    const sala = this.persistencia.obtenerPartida(partidaId);
    const res = sala.iniciar(jugadorId);

    if (res.error) {
      this.conexiones.emitirA(jugadorId, 'error', { mensaje: res.error });
      return;
    }

    this._emitirEstadoPartida(sala);

    this._broadcast(sala, 'turno-cambiado', {
      turno: sala.jugadorEnTurno().jugadorId,
      sentido: sala.sentido,
    });

    if (sala.turnoEsBot()) {
      this._ejecutarTurnoBot(partidaId);
    }
  }

  robarCarta(partidaId, jugadorId) {
    logContext(logger, this);
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

    this._emitirEstadoPartida(sala);

    if (sala.turnoEsBot()) {
      this._ejecutarTurnoBot(partidaId);
    }
  }

  cantarUno(partidaId, jugadorId) {
    logContext(logger, this);
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
    logContext(logger, this);
    const sala = this.persistencia.obtenerPartida(partidaId);
    const res = sala.denunciarUno(jugadorId, acusadoId);

    if (res.error) {
      this.conexiones.emitirA(jugadorId, 'error', { mensaje: res.error });
      return;
    }

    this._broadcast(sala, 'uno-denunciado', { denuncianteId: jugadorId, acusado: res.acusado });
  }

  enviarMensajeChat(partidaId, jugadorId, texto) {
    logContext(logger, this, { partidaId, jugadorId });
    const sala = this.persistencia.obtenerPartida(partidaId);
    if (!sala) return;

    const res = sala.agregarMensajeChat(jugadorId, texto);
    if (res.error) {
      this.conexiones.emitirA(jugadorId, 'error', { mensaje: res.error });
      return;
    }

    this._broadcast(sala, 'mensaje-chat', res.mensaje);
  }

  _broadcast(sala, evento, datos) {
    logContext(logger, this);
    this.conexiones.emitirATodos(
      sala.jugadores.map((j) => j.jugadorId),
      evento,
      datos
    );
  }

  _emitirEstadoPartida(sala) {
    logContext(logger, this);
    for (const j of sala.jugadores) {
      this.conexiones.emitirA(j.jugadorId, 'estado-partida', {
        estado: sala.estadoParaJugador(j.jugadorId),
      });
    }
  }

  async crearPartida(jugadorId, maxJugadores, cantidadBots = 0) {
    logContext(logger, this, { jugadorId, maxJugadores, cantidadBots });

    if (!jugadorId) throw new NotFoundException('jugadorId requerido');

    const jugador = await this.persistencia.obtenerJugador(jugadorId);
    if (!jugador) return { ok: false, status: 404, error: 'Jugador no encontrado' };

    if (this.persistencia.jugadorEstaEnPartida(jugadorId))
      return { ok: false, status: 409, error: 'Ya estás en una partida activa' };

    const bots = parseInt(cantidadBots);
    // Si no se especifica máximo, se asume sala llena: 1 humano + bots, mínimo 2.
    const max = maxJugadores ? parseInt(maxJugadores) : Math.max(2, 1 + bots);

    if (bots < 0 || bots > 3)
      return { ok: false, status: 400, error: 'cantidadBots debe ser entre 0 y 3' };

    if (max < 2 || max > 4)
      return {
        ok: false,
        status: 400,
        error: 'maxJugadores debe ser entre 2 y 4',
      };

    // El creador ocupa un lugar; los bots se agregan en la creación.
    // Resto de los lugares queda libre para humanos que se unan después.
    if (1 + bots > max)
      return {
        ok: false,
        status: 400,
        error: 'La cantidad de bots no puede dejar la sala sin lugar para vos',
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

  async unirJugador(partidaId, jugadorId) {
    logContext(logger, this, { partidaId, jugadorId });

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

    const yaEstaEnEstaSala = sala.jugadores.find((j) => j.jugadorId === jugadorId);

    if (!yaEstaEnEstaSala && this.persistencia.jugadorEstaEnPartida(jugadorId)) {
      this.conexiones.emitirA(jugadorId, 'error', { mensaje: 'Ya estás en una partida activa' });
      return { error: 'Ya estás en una partida activa' };
    }

    if (!yaEstaEnEstaSala) {
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
    } else if (sala.estado === 'jugando') {
      // Reconexión durante una partida en curso: cancelar el abandono diferido si existe.
      const reconectado = this.cancelarAbandonoPendiente(partidaId, jugadorId);
      if (reconectado) {
        this._broadcast(sala, 'jugador-reconectado', {
          jugadorId,
          nombreUsuario: jugador.nombreUsuario,
        });
      }
    }

    this.conexiones.emitirA(jugadorId, 'estado-partida', {
      estado: sala.estadoParaJugador(jugadorId),
    });

    return { ok: true };
  }

  async jugarCarta(partidaId, jugadorId, cartaId, colorElegido) {
    logContext(logger, this, { partidaId, jugadorId, cartaId, colorElegido });

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

      this._emitirEstadoPartida(sala);

      return;
    }

    this._broadcast(sala, 'carta-jugada', { jugadorId, carta: res.carta });

    this._broadcast(sala, 'turno-cambiado', {
      turno: sala.jugadorEnTurno().jugadorId,
      sentido: sala.sentido,
      penalidad: sala.penalidad,
    });

    this._emitirEstadoPartida(sala);

    if (sala.turnoEsBot()) {
      this._ejecutarTurnoBot(partidaId);
    }
  }

  async desconectar(partidaId, jugadorId) {
    logContext(logger, this, { partidaId, jugadorId });

    const sala = this.persistencia.obtenerPartida(partidaId);

    if (!sala || sala.estado === 'terminada') return;

    // Si la partida todavía no arrancó, liberar el slot y dejar la sala viva
    // (otros pueden seguir uniéndose). Solo si no quedan humanos, se elimina.
    if (sala.estado === 'esperando') {
      const res = sala.removerJugador(jugadorId);
      if (res.error) return;

      if (sala.cantidadHumanos() === 0) {
        this.persistencia.eliminarPartida(partidaId);
        return;
      }

      this._broadcast(sala, 'jugador-salio', {
        jugadorId,
        nombreUsuario: res.nombreUsuario,
        nuevoCreadorId: res.nuevoCreadorId,
        totalJugadores: sala.jugadores.length,
      });
      return;
    }

    // Partida en curso: NO marcamos abandono al instante. Damos un período de gracia
    // para que el jugador pueda reconectarse tras un microcorte.
    const jugador = sala.jugadores.find((j) => j.jugadorId === jugadorId);
    if (!jugador) return;

    // Si ya hay un abandono pendiente para este jugador, no programamos otro.
    const clave = this._claveDesconexion(partidaId, jugadorId);
    if (this.desconexionesPendientes.has(clave)) return;

    this._broadcast(sala, 'jugador-desconectado', {
      jugadorId,
      nombreUsuario: jugador.nombreUsuario,
      gracePeriodMs: this.GRACE_PERIOD_MS,
    });

    const timeoutId = setTimeout(() => {
      this.desconexionesPendientes.delete(clave);
      this._concretarAbandono(partidaId, jugadorId).catch((err) => {
        registerLog(logger, 'error', 'Error al concretar abandono.', { error: err.message });
      });
    }, this.GRACE_PERIOD_MS);

    this.desconexionesPendientes.set(clave, timeoutId);
  }

  async abandonarPartida(partidaId, jugadorId) {
    logContext(logger, this, { partidaId, jugadorId });

    const sala = this.persistencia.obtenerPartida(partidaId);
    if (!sala || sala.estado === 'terminada') return;

    this.cancelarAbandonoPendiente(partidaId, jugadorId);

    if (sala.estado === 'esperando') {
      const res = sala.removerJugador(jugadorId);
      if (res.error) return;

      if (sala.cantidadHumanos() === 0) {
        this.persistencia.eliminarPartida(partidaId);
        return;
      }

      this._broadcast(sala, 'jugador-salio', {
        jugadorId,
        nombreUsuario: res.nombreUsuario,
        nuevoCreadorId: res.nuevoCreadorId,
        totalJugadores: sala.jugadores.length,
      });
      return;
    }

    await this._concretarAbandono(partidaId, jugadorId);
  }

  async _concretarAbandono(partidaId, jugadorId) {
    const sala = this.persistencia.obtenerPartida(partidaId);
    if (!sala || sala.estado === 'terminada') return;

    const info = sala.jugadorAbandonó(jugadorId);

    this._broadcast(sala, 'jugador-abandono', {
      jugadorId,
      nombreUsuario: info.nombreUsuario,
      mensaje: 'La partida fue cancelada por abandono',
    });

    // El que abandona recibe -50; los demás no suman ni pierden.
    await this.persistencia.guardarResultadoPartida(partidaId, [
      { jugadorId, puesto: sala.jugadores.length, puntaje: 0, deltaGlobal: -50 },
    ]);

    this.persistencia.eliminarPartida(partidaId);
  }

  async _ejecutarTurnoBot(partidaId) {
    logContext(logger, this, { partidaId });

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
        this._emitirEstadoPartida(salaActual);
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
          this._emitirEstadoPartida(salaActual);
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
          this._emitirEstadoPartida(salaActual);
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
          this._emitirEstadoPartida(salaActual);
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

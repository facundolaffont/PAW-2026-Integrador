const { v4: uuidv4 } = require('uuid');
const SalaDeJuego = require('../modelo/SalaDeJuego');
const BotLLM = require('../modelo/BotLLM');
const ManejadorConexiones = require('../ws/manejadorConexiones');
const { registerLog, logContext } = require('../utils');

const NOMBRES_BOTS = ['Bot-A', 'Bot-B', 'Bot-C'];

const logger = require('../logger');

/**
 * Controlador principal de la lógica de partidas. Se encarga de manejar la creación y gestión de partidas,
 * la unión de jugadores, el procesamiento de jugadas y la gestión de desconexiones.
 *
 * @param {ManejadorConexiones} manejadorConexiones - Manejador de conexiones WebSocket para emitir eventos a los jugadores.
 * @param {Persistencia} persistencia - Capa de persistencia para almacenar y recuperar el estado de las partidas.
 * @param {BotLLM} botLLM - Módulo de lógica de bots para decidir las jugadas de los bots.
 */
class PartidaController {
  constructor(manejadorConexiones, persistencia, botLLM) {
    logContext(logger, this);
    this.manejadorConexiones = manejadorConexiones;
    this.persistencia = persistencia;
    this.botLLM = botLLM;
    // Mapea `${partidaId}:${jugadorId}` → timeoutId del abandono diferido.
    // Si el jugador se reconecta antes de que expire, se cancela.
    this.desconexionesPendientes = new Map();
    this.GRACE_PERIOD_MS = 30000;
  }

  #claveDesconexion(partidaId, jugadorId) {
    return `${partidaId}:${jugadorId}`;
  }

  cancelarAbandonoPendiente(partidaId, jugadorId) {
    const clave = this.#claveDesconexion(partidaId, jugadorId);
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
      this.manejadorConexiones.emitirA(jugadorId, 'error', { mensaje: res.error });
      return;
    }

    this.#emitirEstadoPartida(sala);

    this.#broadcast(sala, 'turno-cambiado', {
      turno: sala.jugadorEnTurno().jugadorId,
      sentido: sala.sentido,
    });

    if (sala.turnoEsBot()) {
      this.#ejecutarTurnoBot(partidaId);
    }
  }

  robarCarta(partidaId, jugadorId) {
    logContext(logger, this);
    const sala = this.persistencia.obtenerPartida(partidaId);
    const res = sala.robarCarta(jugadorId);

    if (res.error) {
      this.manejadorConexiones.emitirA(jugadorId, 'error', { mensaje: res.error });
      return;
    }

    this.manejadorConexiones.emitirA(jugadorId, 'cartas-robadas', {
      cartasRobadas: res.cartasRobadas,
    });
    this.#broadcast(sala, 'turno-cambiado', {
      turno: sala.jugadorEnTurno().jugadorId,
      sentido: sala.sentido,
      penalidad: 0,
      robó: { jugadorId, cantidad: res.cantidad },
    });

    this.#emitirEstadoPartida(sala);

    if (sala.turnoEsBot()) {
      this.#ejecutarTurnoBot(partidaId);
    }
  }

  cantarUno(partidaId, jugadorId) {
    logContext(logger, this);
    const sala = this.persistencia.obtenerPartida(partidaId);
    const jugador = sala.jugadores.find((j) => j.jugadorId === jugadorId);
    const res = sala.cantarUno(jugadorId);

    if (res.error) {
      this.manejadorConexiones.emitirA(jugadorId, 'error', { mensaje: res.error });
      return;
    }

    this.#broadcast(sala, 'uno-cantado', { jugadorId, nombreUsuario: jugador.nombreUsuario });
  }

  denunciarUno(partidaId, jugadorId, acusadoId) {
    logContext(logger, this);
    const sala = this.persistencia.obtenerPartida(partidaId);
    const res = sala.denunciarUno(jugadorId, acusadoId);

    if (res.error) {
      this.manejadorConexiones.emitirA(jugadorId, 'error', { mensaje: res.error });
      return;
    }

    this.#broadcast(sala, 'uno-denunciado', { denuncianteId: jugadorId, acusado: res.acusado });
  }

  #broadcast(sala, evento, datos) {
    logContext(logger, this);

    this.manejadorConexiones.emitirATodos(
      sala.jugadores.map((j) => j.jugadorId),
      evento,
      datos
    );
  }

  #emitirEstadoPartida(sala) {
    logContext(logger, this);
    for (const j of sala.jugadores) {
      this.manejadorConexiones.emitirA(j.jugadorId, 'estado-partida', {
        estado: sala.estadoParaJugador(j.jugadorId),
      });
    }
  }

  async crearPartida(jugadorId, maxJugadores, cantidadBots = 0) {
    logContext(logger, this, { jugadorId, maxJugadores, cantidadBots });

    if (!jugadorId) throw new NotFoundException('jugadorId requerido');

    // Obtiene jugador como instancia de Usuario, si existe, o null si no existe.
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

  /**
   * Intenta unir un jugador a una partida existente, o lo reconecta si ya estaba en ella, anulando la cancelación pendiente de partida.
   *
   * Se valida que la partida exista, que el jugador exista, que el jugador no esté ya en otra partida activa
   * y que la partida no esté llena. Si la unión es exitosa, se notifica a todos los jugadores de la partida
   * sobre el nuevo jugador unido y se envía el estado actual de la partida al jugador que se unió.
   *
   * Utiliza:
   * - this.persistencia.
   * - this.manejadorConexiones.
   *
   * @param {Number} partidaId - Identificador numérico de la partida a la cual se quiere unir el jugador.
   * @param {Number} jugadorId - Identificador numérico del jugador que quiere unirse a la partida.
   * @returns {Object} Resultado de la operación. Puede ser {ok: true} si se añadió el jugador correctamente, o {error: '<mensaje>'} si hubo un error.
   *
   * Posibles mensajes de error:
   * - 'Partida no encontrada.': No existe una partida con el ID proporcionado.
   * - 'Jugador no encontrado.': No existe un jugador con el ID proporcionado.
   * - 'Ya estás en una partida activa.': El jugador ya está participando en otra partida que no ha terminado.
   */
  async unirJugador(partidaId, jugadorId) {
    logContext(logger, this, { partidaId, jugadorId });

    // Obtiene, si existe, una instancia de esta sala de clase SalaDeJuego.
    const sala = this.persistencia.obtenerPartida(partidaId);

    // Si la sala no existe, se notifica al jugador y se retorna un error.
    if (!sala) {
      this.manejadorConexiones.emitirA(jugadorId, 'error', { mensaje: 'Partida no encontrada.' });
      return { error: 'Partida no encontrada.' };
    }

    // Obtiene jugador como instancia de Usuario, si existe, o null si no existe.
    const jugador = await this.persistencia.obtenerJugador(jugadorId);

    // Si el jugador no existe, se notifica y se retorna un error.
    if (!jugador) {
      this.manejadorConexiones.emitirA(jugadorId, 'error', { mensaje: 'Jugador no encontrado.' });
      return { error: 'Jugador no encontrado.' };
    }

    const yaEstaEnEstaSala = sala.jugadores.find((j) => j.jugadorId === jugadorId);

    // Si el jugador ya está en otra partida activa, se notifica y se retorna un error.
    if (!yaEstaEnEstaSala && this.persistencia.jugadorEstaEnPartida(jugadorId)) {
      this.manejadorConexiones.emitirA(jugadorId, 'error', {
        mensaje: 'Ya estás en una partida activa.',
      });
      return { error: 'Ya estás en una partida activa.' };
    }

    // Si el jugador no estaba ya en esta sala, se intenta agregarlo. Si la sala ya está llena,
    // se notifica y se retorna un error. Si tuvo éxito, se notifica a todos los jugadores de la
    // sala sobre el nuevo jugador unido.
    if (!yaEstaEnEstaSala) {
      const resultado = sala.agregarJugador(jugadorId, jugador.nombreUsuario);

      // Si no se logró agregar al jugador (ej. sala llena), se notifica y se retorna un error.
      if (resultado.error) {
        this.manejadorConexiones.emitirA(jugadorId, 'error', { mensaje: resultado.error });
        return { error: resultado.error };
      }

      this.#broadcast(sala, 'jugador-unido', {
        jugadorId,
        nombreUsuario: jugador.nombreUsuario,
        totalJugadores: sala.jugadores.length,
      });
    }

    // Si la sala y el jugador existen, y el jugador ya está en la sala, reconecta al
    // usuario y notifica al resto de los participantes.
    else if (sala.estado === 'jugando') {
      const reconectado = this.cancelarAbandonoPendiente(partidaId, jugadorId);
      if (reconectado) {
        this.#broadcast(sala, 'jugador-reconectado', {
          jugadorId,
          nombreUsuario: jugador.nombreUsuario,
        });
      }
    }

    this.manejadorConexiones.emitirA(jugadorId, 'estado-partida', {
      estado: sala.estadoParaJugador(jugadorId),
    });

    return { ok: true };
  }

  async jugarCarta(partidaId, jugadorId, cartaId, colorElegido) {
    logContext(logger, this, { partidaId, jugadorId, cartaId, colorElegido });

    const sala = this.persistencia.obtenerPartida(partidaId);
    const res = sala.jugarCarta(jugadorId, cartaId, colorElegido);

    if (res.error) {
      this.manejadorConexiones.emitirA(jugadorId, 'error', { mensaje: res.error });
      return;
    }

    if (res.partidaTerminada) {
      await this.persistencia.guardarResultadoPartida(partidaId, res.ranking);

      this.#broadcast(sala, 'partida-terminada', { ranking: res.ranking });

      this.persistencia.eliminarPartida(partidaId);
      return;
    }

    if (res.rondaTerminada) {
      this.#broadcast(sala, 'ronda-terminada', {
        ganadorRonda: res.ganadorRonda,
        puntosGanados: res.puntosGanados,
        puntajesRonda: res.puntajesRonda,
      });

      this.#emitirEstadoPartida(sala);

      return;
    }

    this.#broadcast(sala, 'carta-jugada', { jugadorId, carta: res.carta });

    this.#broadcast(sala, 'turno-cambiado', {
      turno: sala.jugadorEnTurno().jugadorId,
      sentido: sala.sentido,
      penalidad: sala.penalidad,
    });

    this.#emitirEstadoPartida(sala);

    if (sala.turnoEsBot()) {
      this.#ejecutarTurnoBot(partidaId);
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

      this.#broadcast(sala, 'jugador-salio', {
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
    const clave = this.#claveDesconexion(partidaId, jugadorId);
    if (this.desconexionesPendientes.has(clave)) return;

    this.#broadcast(sala, 'jugador-desconectado', {
      jugadorId,
      nombreUsuario: jugador.nombreUsuario,
      gracePeriodMs: this.GRACE_PERIOD_MS,
    });

    const timeoutId = setTimeout(() => {
      this.desconexionesPendientes.delete(clave);
      this.#concretarAbandono(partidaId, jugadorId).catch((err) => {
        registerLog(logger, 'error', 'Error al concretar abandono.', { error: err.message });
      });
    }, this.GRACE_PERIOD_MS);

    this.desconexionesPendientes.set(clave, timeoutId);
  }

  /**
   * Procesa el abandono de un jugador de una partida en curso. Se notifica a los demás jugadores
   * de la partida sobre el abandono y se actualiza el estado de la partida. Si el abandono hace que
   * la partida quede sin jugadores humanos, se termina la partida y se guarda el resultado.
   *
   * Utiliza:
   * - this.persistencia.
   *
   * @param {Number} partidaId - Identificador numérico de la partida la cual abandona el jugador.
   * @param {Number} jugadorId - Identificador numérico del jugador que abandona la partida.
   * @returns {Promise<void>}
   */
  async abandonarPartida(partidaId, jugadorId) {
    logContext(logger, this, { partidaId, jugadorId });

    // Obtiene, si existe, una instancia de esta sala de clase SalaDeJuego.
    const sala = this.persistencia.obtenerPartida(partidaId);

    // Si no existe la sala, o está terminada, no hay nada que hacer.
    if (!sala || sala.estado === 'terminada') return;

    this.cancelarAbandonoPendiente(partidaId, jugadorId);

    if (sala.estado === 'esperando') {
      const res = sala.removerJugador(jugadorId);
      if (res.error) return;

      // Si no hay más humanos luego de remover el jugador, eliminar la partida.
      if (sala.cantidadHumanos() === 0) {
        this.persistencia.eliminarPartida(partidaId);
        return;
      }

      // A esta altura: se removió al jugador y todavía existen humanos en la partida.
      // Se notifica a los demás jugadores sobre la salida y se asigna un nuevo creador
      // si el que se fue era el creador.
      this.#broadcast(sala, 'jugador-salio', {
        jugadorId,
        nombreUsuario: res.nombreUsuario,
        nuevoCreadorId: res.nuevoCreadorId,
        totalJugadores: sala.jugadores.length,
      });

      return;
    }

    await this.#concretarAbandono(partidaId, jugadorId);
  }

  async #concretarAbandono(partidaId, jugadorId) {
    const sala = this.persistencia.obtenerPartida(partidaId);
    if (!sala || sala.estado === 'terminada') return;

    const info = sala.jugadorAbandonó(jugadorId);

    this.#broadcast(sala, 'jugador-abandono', {
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

  async #ejecutarTurnoBot(partidaId) {
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

        this.#broadcast(salaActual, 'turno-cambiado', {
          turno: salaActual.jugadorEnTurno().jugadorId,
          sentido: salaActual.sentido,
          penalidad: 0,
          robó: { jugadorId: bot.jugadorId, cantidad: res.cantidad },
        });
        this.#emitirEstadoPartida(salaActual);
      } else {
        const res = salaActual.jugarCarta(bot.jugadorId, decision.cartaId, decision.colorElegido);

        if (res.error) {
          console.error('[Bot] Jugada inválida, forzando robo:', res.error);
          const resRobo = salaActual.robarCarta(bot.jugadorId);
          this.#broadcast(salaActual, 'turno-cambiado', {
            turno: salaActual.jugadorEnTurno().jugadorId,
            sentido: salaActual.sentido,
            penalidad: 0,
            robó: { jugadorId: bot.jugadorId, cantidad: resRobo.cantidad },
          });
          this.#emitirEstadoPartida(salaActual);
        } else if (res.partidaTerminada) {
          await this.persistencia.guardarResultadoPartida(partidaId, res.ranking);
          this.#broadcast(salaActual, 'partida-terminada', { ranking: res.ranking });
          this.persistencia.eliminarPartida(partidaId);
          return;
        } else if (res.rondaTerminada) {
          this.#broadcast(salaActual, 'ronda-terminada', {
            ganadorRonda: res.ganadorRonda,
            puntosGanados: res.puntosGanados,
            puntajesRonda: res.puntajesRonda,
          });
          this.#emitirEstadoPartida(salaActual);
          return;
        } else {
          if (bot.mano.length === 1) {
            salaActual.cantarUno(bot.jugadorId);
            this.#broadcast(salaActual, 'uno-cantado', {
              jugadorId: bot.jugadorId,
              nombreUsuario: bot.nombreUsuario,
            });
          }
          this.#broadcast(salaActual, 'carta-jugada', {
            jugadorId: bot.jugadorId,
            carta: res.carta,
          });
          this.#broadcast(salaActual, 'turno-cambiado', {
            turno: salaActual.jugadorEnTurno().jugadorId,
            sentido: salaActual.sentido,
            penalidad: salaActual.penalidad,
          });
          this.#emitirEstadoPartida(salaActual);
        }
      }
    } catch (err) {
      console.error('[Bot] Error inesperado:', err);
    }

    if (salaActual.turnoEsBot()) {
      this.#ejecutarTurnoBot(partidaId);
    }
  }
}

module.exports = PartidaController;

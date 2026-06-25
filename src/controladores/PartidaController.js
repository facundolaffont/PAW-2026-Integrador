const { v4: uuidv4 } = require('uuid');
const SalaDeJuego = require('#dominio/SalaDeJuego');
const BotLLM = require('#infraestructura/integraciones/ia/BotLLM');
const ManejadorConexiones = require('#interfaces/ws/manejadorConexiones');
const { registerLog, logContext } = require('#infraestructura/shared/utils');
const logger = require('#infraestructura/shared/logger');

const NOMBRES_BOTS = ['Bot-A', 'Bot-B', 'Bot-C'];

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
    this.unoTimers = new Map();
    this.UNO_TIMEOUT_MS = 2000;
    this.turnoTimers = new Map();
    this.TURNO_TIMEOUT_MS = 10000;
    this.avanceTurnoPendiente = new Map();
    this.ANIMACIONES_TIMEOUT_MS = 45000;
  }

  #cancelarUnoTimer(partidaId) {
    const timeoutId = this.unoTimers.get(partidaId);
    if (timeoutId == null) return false;
    clearTimeout(timeoutId);
    this.unoTimers.delete(partidaId);
    return true;
  }

  #cancelarTurnoTimer(partidaId) {
    const timeoutId = this.turnoTimers.get(partidaId);
    if (timeoutId == null) return false;
    clearTimeout(timeoutId);
    this.turnoTimers.delete(partidaId);
    return true;
  }

  #cancelarAvanceTurnoPendiente(partidaId) {
    const pendiente = this.avanceTurnoPendiente.get(partidaId);
    if (!pendiente) return false;
    clearTimeout(pendiente.timeoutId);
    this.avanceTurnoPendiente.delete(partidaId);
    return true;
  }

  #esperarAnimacionesCliente(partidaId, jugadorId, ejecutar) {
    this.#cancelarAvanceTurnoPendiente(partidaId);

    const timeoutId = setTimeout(() => {
      const actual = this.avanceTurnoPendiente.get(partidaId);
      if (!actual || actual.jugadorId !== jugadorId) return;
      this.avanceTurnoPendiente.delete(partidaId);
      ejecutar();
    }, this.ANIMACIONES_TIMEOUT_MS);

    this.avanceTurnoPendiente.set(partidaId, { jugadorId, ejecutar, timeoutId });
  }

  #programarSiguienteTurno(partidaId, jugadorAccionId) {
    const sala = this.persistencia.obtenerPartida(partidaId);
    if (!sala) return;

    const continuar = () => {
      const salaActual = this.persistencia.obtenerPartida(partidaId);
      if (!salaActual || salaActual.estado !== 'jugando') return;
      this.#programarTurnoTimer(partidaId);
      if (salaActual.turnoEsBot()) {
        this.#ejecutarTurnoBot(partidaId);
      }
    };

    const jugador = sala.jugadores.find((j) => j.jugadorId === jugadorAccionId);
    if (!jugador || jugador.esBot) {
      continuar();
      return;
    }

    this.#esperarAnimacionesCliente(partidaId, jugadorAccionId, continuar);
  }

  animacionesListas(partidaId, jugadorId) {
    const pendiente = this.avanceTurnoPendiente.get(partidaId);
    if (!pendiente || pendiente.jugadorId !== jugadorId) return;
    clearTimeout(pendiente.timeoutId);
    this.avanceTurnoPendiente.delete(partidaId);
    pendiente.ejecutar();
  }

  #programarTurnoTimer(partidaId) {
    this.#cancelarTurnoTimer(partidaId);
    const sala = this.persistencia.obtenerPartida(partidaId);
    if (!sala || sala.estado !== 'jugando') return;

    const jugadorEnTurnoId = sala.jugadorEnTurno().jugadorId;
    const timeoutId = setTimeout(() => {
      this.#ejecutarRoboAutomatico(partidaId, jugadorEnTurnoId).catch((err) => {
        console.error('[turnoTimer] Error en robo automático:', err);
      });
    }, this.TURNO_TIMEOUT_MS);
    this.turnoTimers.set(partidaId, timeoutId);
  }

  async #ejecutarRoboAutomatico(partidaId, jugadorIdEsperado) {
    this.turnoTimers.delete(partidaId);

    const sala = this.persistencia.obtenerPartida(partidaId);
    if (!sala || sala.estado !== 'jugando') return;

    const jugadorEnTurno = sala.jugadorEnTurno();
    if (!jugadorEnTurno || jugadorEnTurno.jugadorId !== jugadorIdEsperado) return;

    const res = sala.robarCarta(jugadorIdEsperado);
    if (res.error) return;

    this.manejadorConexiones.emitirA(jugadorIdEsperado, 'cartas-robadas', {
      cartasRobadas: res.cartasRobadas,
    });
    this.#broadcast(sala, 'turno-cambiado', {
      turno: sala.jugadorEnTurno().jugadorId,
      sentido: sala.sentido,
      penalidad: 0,
      tiempoTurnoMs: this.TURNO_TIMEOUT_MS,
      robó: { jugadorId: jugadorIdEsperado, cantidad: res.cantidad, auto: true },
    });
    this.#emitirEstadoPartida(sala);

    this.#programarSiguienteTurno(partidaId, jugadorIdEsperado);
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

  obtenerPartida(id, jugadorId = null) {
    logContext(logger, this);
    const sala = this.persistencia.obtenerPartida(id);
    if (!sala) return { ok: false, status: 404, error: 'Partida no encontrada' };

    if (jugadorId != null) {
      const ingreso = sala.validarIngreso(jugadorId);
      if (ingreso.error) return { ok: false, status: 403, error: ingreso.error };
    }

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
      tiempoTurnoMs: this.TURNO_TIMEOUT_MS,
    });

    this.#programarTurnoTimer(partidaId);
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
      tiempoTurnoMs: this.TURNO_TIMEOUT_MS,
      robó: { jugadorId, cantidad: res.cantidad },
    });

    this.#emitirEstadoPartida(sala);

    this.#programarSiguienteTurno(partidaId, jugadorId);
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

    this.#broadcast(sala, 'mensaje-chat', res.mensaje);
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
      const ingreso = sala.validarIngreso(jugadorId);
      if (ingreso.error) {
        this.manejadorConexiones.emitirA(jugadorId, 'error', { mensaje: ingreso.error });
        return { error: ingreso.error };
      }

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
    else if (sala.estado === 'jugando' || sala.estado === 'entre-rondas') {
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

    if (res.carta) {
      this.#broadcast(sala, 'carta-jugada', { jugadorId, carta: res.carta });
    }

    if (res.partidaTerminada) {
      this.#cancelarUnoTimer(partidaId);
      this.#cancelarTurnoTimer(partidaId);
      await this.persistencia.guardarResultadoPartida(partidaId, res.ranking);

      this.#broadcast(sala, 'partida-terminada', { ranking: res.ranking });

      this.persistencia.eliminarPartida(partidaId);
      return;
    }

    if (res.rondaTerminada) {
      this.#cancelarUnoTimer(partidaId);
      this.#cancelarTurnoTimer(partidaId);
      this.#broadcast(sala, 'ronda-terminada', {
        ganadorRonda: res.ganadorRonda,
        puntosGanados: res.puntosGanados,
        puntajesRonda: res.puntajesRonda,
      });

      return;
    }

    this.#manejarUnoTrasJugada(partidaId, res);

    this.#broadcast(sala, 'turno-cambiado', {
      turno: sala.jugadorEnTurno().jugadorId,
      sentido: sala.sentido,
      penalidad: sala.penalidad,
      tiempoTurnoMs: this.TURNO_TIMEOUT_MS,
    });

    this.#emitirEstadoPartida(sala);

    this.#programarSiguienteTurno(partidaId, jugadorId);
  }

  #manejarUnoTrasJugada(partidaId, res) {
    const sala = this.persistencia.obtenerPartida(partidaId);
    if (!sala) return;

    if (res.unoAutoCantadoBot) {
      this.#broadcast(sala, 'uno-cantado', {
        jugadorEnUno: res.unoAutoCantadoBot.jugadorEnUno,
        cantadoPor: res.unoAutoCantadoBot.jugadorEnUno,
        auto: true,
      });
      return;
    }

    if (res.unoPendiente) {
      this.#cancelarUnoTimer(partidaId);
      this.#broadcast(sala, 'uno-pendiente', {
        jugadorEnUno: res.unoPendiente.jugadorEnUno,
        timeoutMs: res.unoPendiente.timeoutMs,
      });
      const timeoutId = setTimeout(() => {
        this.#resolverUnoTimeout(partidaId);
      }, res.unoPendiente.timeoutMs);
      this.unoTimers.set(partidaId, timeoutId);
    }
  }

  cantarUno(partidaId, jugadorId) {
    logContext(logger, this, { partidaId, jugadorId });
    const sala = this.persistencia.obtenerPartida(partidaId);
    if (!sala) return;

    const res = sala.cantarUno(jugadorId);
    if (res.error) {
      if (res.error !== 'No hay UNO pendiente') {
        this.manejadorConexiones.emitirA(jugadorId, 'error', { mensaje: res.error });
      }
      return;
    }

    this.#cancelarUnoTimer(partidaId);

    if (res.salvado) {
      this.#broadcast(sala, 'uno-cantado', {
        jugadorEnUno: res.jugadorEnUno,
        cantadoPor: jugadorId,
        auto: false,
      });
      return;
    }

    if (res.atrapado) {
      this.#broadcast(sala, 'uno-penalizado', {
        jugadorEnUno: res.jugadorEnUno,
        atrapadoPor: res.atrapadoPor,
        cantidad: res.cartasRobadas.length,
      });
      this.manejadorConexiones.emitirA(res.jugadorEnUno, 'cartas-robadas', {
        cartasRobadas: res.cartasRobadas,
      });
      this.#emitirEstadoPartida(sala);
    }
  }

  #resolverUnoTimeout(partidaId) {
    this.unoTimers.delete(partidaId);

    const sala = this.persistencia.obtenerPartida(partidaId);
    if (!sala) return;

    const res = sala.resolverUnoPorTimeout();
    if (res.noop) return;

    if (res.vencido) {
      this.#broadcast(sala, 'uno-vencido', { jugadorEnUno: res.jugadorEnUno });
      return;
    }

    if (res.atrapadoPorBot) {
      this.#broadcast(sala, 'uno-penalizado', {
        jugadorEnUno: res.jugadorEnUno,
        atrapadoPor: 'bot',
        cantidad: res.cartasRobadas.length,
      });
      this.manejadorConexiones.emitirA(res.jugadorEnUno, 'cartas-robadas', {
        cartasRobadas: res.cartasRobadas,
      });
      this.#emitirEstadoPartida(sala);
    }
  }

  continuarRonda(partidaId, jugadorId) {
    logContext(logger, this, { partidaId, jugadorId });

    const sala = this.persistencia.obtenerPartida(partidaId);
    const res = sala.continuarRonda(jugadorId);

    if (res.error) {
      this.manejadorConexiones.emitirA(jugadorId, 'error', { mensaje: res.error });
      return;
    }

    if (!res.rondaIniciada) return;

    this.#emitirEstadoPartida(sala);
    this.#broadcast(sala, 'turno-cambiado', {
      turno: sala.jugadorEnTurno().jugadorId,
      sentido: sala.sentido,
      penalidad: sala.penalidad,
      tiempoTurnoMs: this.TURNO_TIMEOUT_MS,
    });

    this.#programarTurnoTimer(partidaId);
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

    this.#cancelarUnoTimer(partidaId);
    this.#cancelarTurnoTimer(partidaId);

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

      // El timer global puede haber disparado un robo automático mientras esperábamos
      // la decisión del LLM. Si el turno ya no es del bot, descartamos la decisión.
      if (
        salaActual.estado !== 'jugando' ||
        salaActual.jugadorEnTurno()?.jugadorId !== bot.jugadorId
      ) {
        return;
      }

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
          tiempoTurnoMs: this.TURNO_TIMEOUT_MS,
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
            tiempoTurnoMs: this.TURNO_TIMEOUT_MS,
            robó: { jugadorId: bot.jugadorId, cantidad: resRobo.cantidad },
          });
          this.#emitirEstadoPartida(salaActual);
        } else if (res.partidaTerminada) {
          this.#cancelarUnoTimer(partidaId);
          this.#cancelarTurnoTimer(partidaId);
          if (res.carta) {
            this.#broadcast(salaActual, 'carta-jugada', {
              jugadorId: bot.jugadorId,
              carta: res.carta,
            });
          }
          await this.persistencia.guardarResultadoPartida(partidaId, res.ranking);
          this.#broadcast(salaActual, 'partida-terminada', { ranking: res.ranking });
          this.persistencia.eliminarPartida(partidaId);
          return;
        } else if (res.rondaTerminada) {
          this.#cancelarUnoTimer(partidaId);
          this.#cancelarTurnoTimer(partidaId);
          if (res.carta) {
            this.#broadcast(salaActual, 'carta-jugada', {
              jugadorId: bot.jugadorId,
              carta: res.carta,
            });
          }
          this.#broadcast(salaActual, 'ronda-terminada', {
            ganadorRonda: res.ganadorRonda,
            puntosGanados: res.puntosGanados,
            puntajesRonda: res.puntajesRonda,
          });
          return;
        } else {
          this.#broadcast(salaActual, 'carta-jugada', {
            jugadorId: bot.jugadorId,
            carta: res.carta,
          });
          this.#manejarUnoTrasJugada(partidaId, res);
          this.#broadcast(salaActual, 'turno-cambiado', {
            turno: salaActual.jugadorEnTurno().jugadorId,
            sentido: salaActual.sentido,
            penalidad: salaActual.penalidad,
            tiempoTurnoMs: this.TURNO_TIMEOUT_MS,
          });
          this.#emitirEstadoPartida(salaActual);
        }
      }
    } catch (err) {
      console.error('[Bot] Error inesperado:', err);
      // Si el LLM falló (timeout, sin tokens, etc.), no reprogramamos: el robo automático
      // del timer global ya se encarga del avance del turno.
      return;
    }

    this.#programarTurnoTimer(partidaId);
    if (salaActual.turnoEsBot()) {
      this.#ejecutarTurnoBot(partidaId);
    }
  }
}

module.exports = PartidaController;

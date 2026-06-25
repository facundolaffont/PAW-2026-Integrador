const { v4: uuidv4 } = require('uuid');
const Mazo = require('#dominio/Mazo');
const JugadorEnSala = require('#dominio/JugadorEnSala');
const Carta = require('#dominio/Carta');
const logger = require('#infraestructura/shared/logger');
class SalaDeJuego {
  /** @type {JugadorEnSala[]} */
  jugadores;

  /** @type {Object.<string, number>} - Donde la clave es el ID del jugador
   * y el valor es su puntaje en la ronda
   */
  puntajesRonda;

  constructor(partidaId, creadorId, maxJugadores) {
    logger.logContext(this);

    this.partidaId = partidaId;
    this.creadorId = creadorId;
    this.maxJugadores = maxJugadores;
    this.estado = 'esperando';

    this.jugadores = [];
    this.mazo = new Mazo();
    this.descarte = [];
    this.turnoIdx = 0;
    this.inicioRondaIdx = -1;
    this.repartidorIdx = -1;
    this.numeroRonda = 0;
    this.sentido = 1;
    this.penalidad = 0;
    this.tipoPenalidad = null;
    this.puntajesRonda = {};
    this.entreRondas = false;
    this.continuaronRonda = new Set();

    this.unoPendiente = null;

    // Chat de la sala
    this.mensajesChat = [];
    this.MAX_MENSAJES_CHAT = 100;
    this.MAX_LARGO_MENSAJE = 200;
  }

  agregarMensajeChat(jugadorId, texto) {
    logger.logContext(this);
    if (typeof texto !== 'string') return { error: 'Mensaje inválido' };
    const limpio = texto.trim();
    if (!limpio) return { error: 'El mensaje no puede estar vacío' };
    if (limpio.length > this.MAX_LARGO_MENSAJE) {
      return { error: `El mensaje supera el máximo de ${this.MAX_LARGO_MENSAJE} caracteres` };
    }

    const jugador = this.jugadores.find((j) => j.jugadorId === jugadorId);
    if (!jugador) return { error: 'No estás en la sala' };
    if (jugador.esBot) return { error: 'Los bots no pueden chatear' };

    const mensaje = {
      jugadorId,
      nombreUsuario: jugador.nombreUsuario,
      texto: limpio,
      timestamp: Date.now(),
    };

    this.mensajesChat.push(mensaje);
    if (this.mensajesChat.length > this.MAX_MENSAJES_CHAT) {
      this.mensajesChat.splice(0, this.mensajesChat.length - this.MAX_MENSAJES_CHAT);
    }

    return { ok: true, mensaje };
  }

  // ─── Sala ────────────────────────────────────────────────────────────────

  agregarBot(nombreBot) {
    logger.logContext(this);
    if (this.jugadores.length >= this.maxJugadores) return null;

    const botId = `bot-${uuidv4()}`;
    const bot = new JugadorEnSala(botId, nombreBot, true);
    this.jugadores.push(bot);
    this.puntajesRonda[botId] = 0;

    return botId;
  }

  /**
   * Agrega un jugador a la sala si la partida aún no ha comenzado, la sala no está llena y el jugador
   * no está ya en la sala.
   *
   * Utiliza:
   * - this.estado.
   * - this.jugadores.
   * - this.maxJugadores.
   * - this.puntajesRonda.
   *
   * @param {Number} jugadorId - Identificador numérico del jugador a agregar.
   * @param {String} nombreUsuario - Nombre del usuario a agregar.
   * @returns {Object} { ok: true } si se agregó correctamente, o { error: 'mensaje' }
   * si hubo un error (partida ya comenzó, sala llena, jugador ya en la sala).
   */
  agregarJugador(jugadorId, nombreUsuario) {
    logger.logContext(this);

    if (this.estado !== 'esperando') return { error: 'La partida ya comenzó' };
    if (this.jugadores.length >= this.maxJugadores) return { error: 'Sala llena' };
    if (this.jugadores.find((j) => j.jugadorId === jugadorId))
      return { error: 'Ya estás en la sala' };

    // Agrega el jugador a la sala y le asigna un puntaje inicial de 0 para la ronda actual.
    const jugador = new JugadorEnSala(jugadorId, nombreUsuario);
    this.jugadores.push(jugador);
    this.puntajesRonda[jugadorId] = 0;

    return { ok: true };
  }

  /**
   * Indica si el jugador ya forma parte de la sala.
   *
   * @param {string} jugadorId - Identificador del jugador.
   * @returns {boolean}
   */
  tieneJugador(jugadorId) {
    return this.jugadores.some((j) => j.jugadorId === jugadorId);
  }

  /**
   * Valida si un jugador puede ingresar a la sala (nuevo ingreso o reconexión).
   *
   * @param {string} jugadorId - Identificador del jugador.
   * @returns {{ ok: true } | { error: string }}
   */
  validarIngreso(jugadorId) {
    if (this.tieneJugador(jugadorId)) return { ok: true };
    if (this.estado === 'esperando') return { ok: true };
    if (this.estado === 'terminada') return { error: 'La partida ya finalizó.' };
    return { error: 'La partida ya comenzó. No podés unirte ahora.' };
  }

  resumenPublico() {
    logger.logContext(this);
    return {
      partidaId: this.partidaId,
      creadorId: this.creadorId,
      estado: this.estado,
      jugadores: this.jugadores.map((j) => j.nombreUsuario),
      maxJugadores: this.maxJugadores,
    };
  }

  // ─── Inicio ──────────────────────────────────────────────────────────────

  iniciar(jugadorId) {
    logger.logContext(this);
    if (jugadorId !== this.creadorId) return { error: 'Solo el creador puede iniciar' };

    if (this.estado !== 'esperando') return { error: 'La partida ya comenzó' };

    if (this.jugadores.length < 2) return { error: 'Se necesitan al menos 2 jugadores' };

    this.estado = 'jugando';

    this._iniciarRonda();

    return { ok: true };
  }

  _iniciarRonda() {
    logger.logContext(this);
    this.mazo = Mazo.crearCompleto();
    this.descarte = [];
    this.numeroRonda += 1;

    if (this.inicioRondaIdx === -1) {
      const indiceCreador = this.jugadores.findIndex((j) => j.jugadorId === this.creadorId);
      this.inicioRondaIdx = indiceCreador >= 0 ? indiceCreador : 0;
    } else {
      this.inicioRondaIdx = this._siguienteIndice(this.inicioRondaIdx, 1);
    }

    this.sentido = 1;
    this.repartidorIdx = this._siguienteIndice(this.inicioRondaIdx, -1);
    this.penalidad = 0;
    this.tipoPenalidad = null;
    this.turnoIdx = this.inicioRondaIdx;

    for (const jugador of this.jugadores) {
      jugador.reiniciarMano();
      jugador.recibirCartas(this.mazo.robar(7));
    }

    let primera;

    do {
      [primera] = this.mazo.robar();

      if (primera.esComodin) this.mazo.agregar(primera);
    } while (primera.esComodin);

    this.descarte.push(primera);
    this._aplicarEfectoPrimeraCarta(primera);
  }

  // ─── Turno ───────────────────────────────────────────────────────────────

  jugadorEnTurno() {
    logger.logContext(this);
    return this.jugadores[this.turnoIdx];
  }

  turnoEsBot() {
    logger.logContext(this);
    return !!this.jugadorEnTurno()?.esBot;
  }

  estadoParaBot() {
    logger.logContext(this);
    const bot = this.jugadorEnTurno();

    const cartaEnMesa = this._cartaEnMesa();

    const rivales = this.jugadores
      .filter((j) => j.jugadorId !== bot.jugadorId)
      .map((j) => ({ nombre: j.nombreUsuario, cantidadCartas: j.cantidadCartas }));

    return {
      mano: bot.mano,
      cartaEnMesa,
      penalidad: this.penalidad,
      tipoPenalidad: this.tipoPenalidad,
      rivales,
    };
  }

  _cartaEnMesa() {
    logger.logContext(this);
    return this.descarte[this.descarte.length - 1];
  }

  _siguienteIndice(indiceBase, direccion = 1) {
    logger.logContext(this);
    const n = this.jugadores.length;
    return (((indiceBase + direccion) % n) + n) % n;
  }

  _avanzarTurno(saltar = false) {
    logger.logContext(this);
    const pasos = saltar ? 2 : 1;
    this.turnoIdx = this._siguienteIndice(this.turnoIdx, this.sentido * pasos);
  }

  _aplicarEfectoPrimeraCarta(carta) {
    logger.logContext(this);
    switch (carta.getTipo()) {
      case 'reversa':
        this.sentido *= -1;
        break;
      case 'roba-dos':
        this.penalidad = 2;
        this.tipoPenalidad = 'roba-dos';
        break;
      case 'salta':
        this.turnoIdx = this._siguienteIndice(this.turnoIdx, this.sentido);
        break;
    }
  }

  // ─── Jugadas ─────────────────────────────────────────────────────────────

  jugarCarta(jugadorId, cartaId, colorElegido) {
    logger.logContext(this);
    if (this.estado !== 'jugando') return { error: 'La partida no está en curso' };

    const jugador = this.jugadorEnTurno();
    if (jugador.jugadorId !== jugadorId) return { error: 'No es tu turno' };

    const carta = jugador.mano.find((c) => c.getId() === cartaId);
    if (!carta) return { error: 'No tenés esa carta' };

    const cartaEnMesa = this._cartaEnMesa();
    if (!Carta.esJugadaValida(carta, cartaEnMesa, this.penalidad, this.tipoPenalidad)) {
      return { error: 'Jugada inválida para la carta en mesa' };
    }

    if (carta.esComodin) {
      if (!Carta.COLORES.includes(colorElegido)) {
        return { error: 'Debés elegir un color válido para el comodín' };
      }
      carta.setColorElegido(colorElegido);
    } else {
      carta.setColorElegido(null);
    }

    jugador.quitarCarta(cartaId);

    this.descarte.push(carta);

    if (jugador.gano) {
      this.unoPendiente = null;
      return this._cerrarRonda(jugadorId, carta);
    }

    let unoInfo = null;
    if (jugador.mano.length === 1) {
      this.unoPendiente = null;
      jugador.canto = false;

      if (jugador.esBot) {
        jugador.canto = true;
        unoInfo = { unoAutoCantadoBot: { jugadorEnUno: jugador.jugadorId } };
      } else {
        const hayBots = this.jugadores.some(
          (j) => j.esBot && j.jugadorId !== jugador.jugadorId
        );
        this.unoPendiente = { jugadorId: jugador.jugadorId, hayBots, resuelto: false };
        unoInfo = { unoPendiente: { jugadorEnUno: jugador.jugadorId, timeoutMs: 2000 } };
      }
    }

    const { turnoIdx, sentido } = this._aplicarEfecto(carta);

    return { ok: true, carta, turnoIdx, sentido, ...(unoInfo || {}) };
  }

  _aplicarEfecto(carta) {
    logger.logContext(this);
    let saltar = false;

    switch (carta.getTipo()) {
      case 'roba-dos':
        this.penalidad += 2;
        this.tipoPenalidad = 'roba-dos';
        saltar = true;
        break;
      case 'roba-cuatro':
        this.penalidad += 4;
        this.tipoPenalidad = 'roba-cuatro';
        saltar = true;
        break;
      case 'salta':
        saltar = true;
        break;
      case 'reversa':
        this.sentido *= -1;
        if (this.jugadores.length === 2) saltar = true;
        break;
    }

    this._avanzarTurno(false);
    if (saltar && !carta.esAcumulable) this._avanzarTurno(false);

    return { turnoIdx: this.turnoIdx, sentido: this.sentido };
  }

  robarCarta(jugadorId) {
    logger.logContext(this);
    if (this.estado !== 'jugando') return { error: 'La partida no está en curso' };

    const jugador = this.jugadorEnTurno();
    if (jugador.jugadorId !== jugadorId) return { error: 'No es tu turno' };

    const cantidad = this.penalidad > 0 ? this.penalidad : 1;
    this.penalidad = 0;
    this.tipoPenalidad = null;

    const robadas = this._robarDelMazo(jugador, cantidad);
    this._avanzarTurno(false);

    let unoCancelado = false;
    if (this.unoPendiente && this.unoPendiente.jugadorId === jugadorId) {
      this.unoPendiente = null;
      unoCancelado = true;
    }

    return {
      ok: true,
      cantidad,
      cartasRobadas: robadas,
      turnoIdx: this.turnoIdx,
      unoCancelado,
    };
  }

  cantarUno(jugadorId) {
    logger.logContext(this);

    if (!this.unoPendiente || this.unoPendiente.resuelto) {
      return { error: 'No hay UNO pendiente' };
    }

    const jugador = this.jugadores.find((j) => j.jugadorId === jugadorId);
    if (!jugador) return { error: 'No estás en la sala' };
    if (jugador.esBot) return { error: 'Los bots no cantan UNO' };

    const jugadorEnUno = this.unoPendiente.jugadorId;
    this.unoPendiente.resuelto = true;

    if (jugadorId === jugadorEnUno) {
      const enUno = this.jugadores.find((j) => j.jugadorId === jugadorEnUno);
      if (enUno) enUno.canto = true;
      this.unoPendiente = null;
      return { ok: true, salvado: true, jugadorEnUno };
    }

    const enUno = this.jugadores.find((j) => j.jugadorId === jugadorEnUno);
    const cartasRobadas = enUno ? this._robarDelMazo(enUno, 2) : [];
    this.unoPendiente = null;

    return {
      ok: true,
      atrapado: true,
      jugadorEnUno,
      atrapadoPor: jugadorId,
      cartasRobadas,
    };
  }

  resolverUnoPorTimeout() {
    logger.logContext(this);

    if (!this.unoPendiente || this.unoPendiente.resuelto) return { noop: true };

    const { jugadorId: jugadorEnUno, hayBots } = this.unoPendiente;
    this.unoPendiente.resuelto = true;
    this.unoPendiente = null;

    if (!hayBots) return { vencido: true, jugadorEnUno };

    const enUno = this.jugadores.find((j) => j.jugadorId === jugadorEnUno);
    const cartasRobadas = enUno ? this._robarDelMazo(enUno, 2) : [];

    return { atrapadoPorBot: true, jugadorEnUno, cartasRobadas };
  }

  _robarDelMazo(jugador, cantidad) {
    logger.logContext(this);
    const robadas = [];

    for (let i = 0; i < cantidad; i++) {
      if (this.mazo.estaVacio) {
        const ultima = this.descarte.pop();
        this.mazo = new Mazo(this.descarte);
        this.mazo.mezclar();
        this.descarte = [ultima];
      }
      if (!this.mazo.estaVacio) {
        const [carta] = this.mazo.robar();
        jugador.recibirCartas([carta]);
        robadas.push(carta);
      }
    }

    return robadas;
  }

  // ─── Ronda / Partida ─────────────────────────────────────────────────────

  _cerrarRonda(ganadorId, cartaFinal = null) {
    logger.logContext(this);
    let PUNTAJE_PARA_GANAR = 200;

    let puntosGanados = 0;

    for (const j of this.jugadores) {
      if (j.jugadorId === ganadorId) continue;
      puntosGanados += j.mano.reduce((sum, c) => sum + c.valor, 0);
    }

    this.puntajesRonda[ganadorId] = (this.puntajesRonda[ganadorId] || 0) + puntosGanados;

    if (this.puntajesRonda[ganadorId] >= PUNTAJE_PARA_GANAR) {
      return this._cerrarPartida(ganadorId, cartaFinal);
    }

    this.estado = 'entre-rondas';
    this.entreRondas = true;
    this.continuaronRonda = new Set();

    return {
      ok: true,
      carta: cartaFinal,
      rondaTerminada: true,
      ganadorRonda: ganadorId,
      puntosGanados,
      puntajesRonda: { ...this.puntajesRonda },
    };
  }

  _cerrarPartida(ganadorId, cartaFinal = null) {
    logger.logContext(this);
    this.estado = 'terminada';

    const deltas = [50, 0, -25, -50];

    const ranking = this.jugadores
      .map((j) => ({
        jugadorId: j.jugadorId,
        nombre: j.nombreUsuario,
        puntaje: this.puntajesRonda[j.jugadorId] || 0,
      }))
      .sort((a, b) => b.puntaje - a.puntaje);

    ranking.forEach((r, i) => {
      r.puesto = i + 1;
      r.deltaGlobal = deltas[i] || -50;
    });

    return { ok: true, carta: cartaFinal, partidaTerminada: true, ranking };
  }

  continuarRonda(jugadorId) {
    logger.logContext(this);
    if (!this.entreRondas) return { error: 'No hay una ronda pendiente de continuar' };

    const jugador = this.jugadores.find((j) => j.jugadorId === jugadorId);
    if (!jugador) return { error: 'No estás en la sala' };
    if (jugador.esBot) return { error: 'Los bots no pueden continuar la ronda' };

    this.continuaronRonda.add(jugadorId);

    const humanos = this.jugadores.filter((j) => !j.esBot);
    const todosListos = humanos.every((j) => this.continuaronRonda.has(j.jugadorId));
    if (!todosListos) return { ok: true, esperando: true };

    this.entreRondas = false;
    this.continuaronRonda.clear();
    this.estado = 'jugando';
    this._iniciarRonda();

    return { ok: true, rondaIniciada: true };
  }

  jugadorAbandonó(jugadorId) {
    logger.logContext(this);
    this.estado = 'terminada';

    const jugador = this.jugadores.find((j) => j.jugadorId === jugadorId);

    return { nombreUsuario: jugador?.nombreUsuario };
  }

  /**
   * Remueve a un jugador de la sala si la partida aún no ha comenzado. Si el jugador a
   * remover es el creador de la sala, se asigna como nuevo creador al primer jugador
   * humano restante, o null si no quedan humanos.
   *
   * Utiliza:
   * - this.jugadores.
   * - this.creadorId.
   * - this.puntajesRonda.
   *
   * @param {Number} jugadorId Identificador numérico del jugador.
   * @returns {Object} Resultado de la operación, incluyendo el nombre
   * del jugador removido y el id del nuevo creador, si aplica, con formato
   * { ok: true, nombreUsuario: '<nombre>', nuevoCreadorId: <id> | null }, o un
   * mensaje de error con formato { error: '<mensaje>' }.
   *
   * Los mensajes de error pueden ser:
   * - 'Jugador no estaba en la sala.'.
   */
  removerJugador(jugadorId) {
    logger.logContext(this);

    // Busca el índice del jugador a remover en el arreglo de jugadores.
    // Si no se encuentra, devuelve un error.
    const indiceJugador = this.jugadores.findIndex((j) => j.jugadorId === jugadorId);
    if (indiceJugador === -1) return { error: 'Jugador no estaba en la sala.' };

    const [jugadorEliminado] = this.jugadores.splice(indiceJugador, 1);

    // Elimina la propiedad de puntajesRonda que contiene el puntaje del jugador eliminado.
    delete this.puntajesRonda[jugadorId];

    let nuevoCreadorId = this.creadorId;
    if (jugadorId === this.creadorId) {
      // Busca al primer jugador humano restante para asignarle el rol de creador.
      const nuevoCreador = this.jugadores.find((j) => !j.esBot);
      nuevoCreadorId = nuevoCreador ? nuevoCreador.jugadorId : null;
      this.creadorId = nuevoCreadorId;
    }

    return { ok: true, nombreUsuario: jugadorEliminado.nombreUsuario, nuevoCreadorId };
  }

  cantidadHumanos() {
    logger.logContext(this);
    return this.jugadores.filter((j) => !j.esBot).length;
  }

  estadoParaJugador(jugadorId) {
    logger.logContext(this);
    const enMesa = this._cartaEnMesa() || null;
    const descarteVisible = this.descarte.slice(-5);

    return {
      partidaId: this.partidaId,
      estado: this.estado,
      creadorId: this.creadorId,
      numeroRonda: this.numeroRonda,
      iniciadorRondaId: this.jugadores[this.inicioRondaIdx]?.jugadorId || null,
      repartidorId: this.jugadores[this.repartidorIdx]?.jugadorId || null,
      turno: this.jugadores[this.turnoIdx]?.jugadorId,
      sentido: this.sentido,
      cartaEnMesa: enMesa,
      descarte: descarteVisible,
      penalidad: this.penalidad,
      tipoPenalidad: this.tipoPenalidad,
      jugadores: this.jugadores.map((j) => ({
        jugadorId: j.jugadorId,
        nombreUsuario: j.nombreUsuario,
        cantidadCartas: j.cantidadCartas,
        mano: j.jugadorId === jugadorId ? j.mano : undefined,
      })),
      puntajesRonda: this.puntajesRonda,
      mensajesChat: this.mensajesChat,
    };
  }
}

module.exports = SalaDeJuego;

const { v4: uuidv4 } = require('uuid');
const Mazo = require('./Mazo');
const JugadorEnSala = require('./JugadorEnSala');
const Carta = require('./Carta');
const logger = require('../logger');
const { logContext } = require('../utils');

class SalaDeJuego {
  /** @type {JugadorEnSala[]} */
  jugadores;

  /** @type {Object.<string, number>} - Donde la clave es el ID del jugador
   * y el valor es su puntaje en la ronda
   */
  puntajesRonda;

  constructor(partidaId, creadorId, maxJugadores) {
    logContext(logger, this);

    this.partidaId = partidaId;
    this.creadorId = creadorId;
    this.maxJugadores = maxJugadores;
    this.estado = 'esperando';

    this.jugadores = [];
    this.mazo = new Mazo();
    this.descarte = [];
    this.turnoIdx = 0;
    this.repartidorIdx = -1;
    this.numeroRonda = 0;
    this.sentido = 1;
    this.penalidad = 0;
    this.tipoPenalidad = null;
    this.puntajesRonda = {};

    // Chat de la sala
    this.mensajesChat = [];
    this.MAX_MENSAJES_CHAT = 100;
    this.MAX_LARGO_MENSAJE = 200;
  }

  agregarMensajeChat(jugadorId, texto) {
    logContext(logger, this);
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
    logContext(logger, this);
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
    logContext(logger, this);

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

  resumenPublico() {
    logContext(logger, this);
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
    logContext(logger, this);
    if (jugadorId !== this.creadorId) return { error: 'Solo el creador puede iniciar' };

    if (this.estado !== 'esperando') return { error: 'La partida ya comenzó' };

    if (this.jugadores.length < 2) return { error: 'Se necesitan al menos 2 jugadores' };

    this.estado = 'jugando';

    this._iniciarRonda();

    return { ok: true };
  }

  _iniciarRonda() {
    logContext(logger, this);
    this.mazo = Mazo.crearCompleto();
    this.descarte = [];
    this.numeroRonda += 1;
    this.repartidorIdx =
      this.repartidorIdx === -1
        ? this.jugadores.length - 1
        : this._siguienteIndice(this.repartidorIdx, 1);
    this.sentido = 1;
    this.penalidad = 0;
    this.tipoPenalidad = null;
    this.turnoIdx = this._siguienteIndice(this.repartidorIdx, this.sentido);

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
    logContext(logger, this);
    return this.jugadores[this.turnoIdx];
  }

  turnoEsBot() {
    logContext(logger, this);
    return !!this.jugadorEnTurno()?.esBot;
  }

  estadoParaBot() {
    logContext(logger, this);
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
    logContext(logger, this);
    return this.descarte[this.descarte.length - 1];
  }

  _siguienteIndice(indiceBase, direccion = 1) {
    logContext(logger, this);
    const n = this.jugadores.length;
    return (((indiceBase + direccion) % n) + n) % n;
  }

  _avanzarTurno(saltar = false) {
    logContext(logger, this);
    const pasos = saltar ? 2 : 1;
    this.turnoIdx = this._siguienteIndice(this.turnoIdx, this.sentido * pasos);
  }

  _aplicarEfectoPrimeraCarta(carta) {
    logContext(logger, this);
    switch (carta.tipo) {
      case 'reversa':
        this.sentido *= -1;
        this.turnoIdx = this._siguienteIndice(this.repartidorIdx, this.sentido);
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
    logContext(logger, this);
    if (this.estado !== 'jugando') return { error: 'La partida no está en curso' };

    const jugador = this.jugadorEnTurno();
    if (jugador.jugadorId !== jugadorId) return { error: 'No es tu turno' };

    const carta = jugador.mano.find((c) => c.id === cartaId);
    if (!carta) return { error: 'No tenés esa carta' };

    const cartaEnMesa = this._cartaEnMesa();
    if (!Carta.esJugadaValida(carta, cartaEnMesa, this.penalidad, this.tipoPenalidad)) {
      return { error: 'Jugada inválida para la carta en mesa' };
    }

    if (carta.esComodin) {
      if (!Carta.COLORES.includes(colorElegido)) {
        return { error: 'Debés elegir un color válido para el comodín' };
      }
      carta.colorElegido = colorElegido;
    } else {
      carta.colorElegido = null;
    }

    jugador.quitarCarta(cartaId);

    this.descarte.push(carta);

    if (jugador.gano) {
      return this._cerrarRonda(jugadorId, carta);
    }

    const { turnoIdx, sentido } = this._aplicarEfecto(carta);

    return { ok: true, carta, turnoIdx, sentido };
  }

  _aplicarEfecto(carta) {
    logContext(logger, this);
    let saltar = false;

    switch (carta.tipo) {
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
    logContext(logger, this);
    if (this.estado !== 'jugando') return { error: 'La partida no está en curso' };

    const jugador = this.jugadorEnTurno();
    if (jugador.jugadorId !== jugadorId) return { error: 'No es tu turno' };

    const cantidad = this.penalidad > 0 ? this.penalidad : 1;
    this.penalidad = 0;
    this.tipoPenalidad = null;

    const robadas = this._robarDelMazo(jugador, cantidad);
    this._avanzarTurno(false);

    return { ok: true, cantidad, cartasRobadas: robadas, turnoIdx: this.turnoIdx };
  }

  _robarDelMazo(jugador, cantidad) {
    logContext(logger, this);
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
    logContext(logger, this);
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

    this._iniciarRonda();

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
    logContext(logger, this);
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

  jugadorAbandonó(jugadorId) {
    logContext(logger, this);
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
    logContext(logger, this);

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
    logContext(logger, this);
    return this.jugadores.filter((j) => !j.esBot).length;
  }

  estadoParaJugador(jugadorId) {
    logContext(logger, this);
    const enMesa = this._cartaEnMesa() || null;
    const descarteVisible = this.descarte.slice(-5);

    return {
      partidaId: this.partidaId,
      estado: this.estado,
      numeroRonda: this.numeroRonda,
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

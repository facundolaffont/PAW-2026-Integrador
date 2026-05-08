const { v4: uuidv4 } = require('uuid');
const Mazo = require('./Mazo');
const JugadorEnSala = require('./JugadorEnSala');
const logger = require('../logger');
const { logContext } = require('../utils');

class SalaDeJuego {
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
    this.sentido = 1;
    this.penalidad = 0;
    this.tipoPenalidad = null;
    this.puntajesRonda = {};
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

  agregarJugador(jugadorId, nombreUsuario) {
    logContext(logger, this);
    if (this.estado !== 'esperando') return { error: 'La partida ya comenzó' };

    if (this.jugadores.length >= this.maxJugadores) return { error: 'Sala llena' };

    if (this.jugadores.find((j) => j.jugadorId === jugadorId))
      return { error: 'Ya estás en la sala' };

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
    this.turnoIdx = 0;
    this.sentido = 1;
    this.penalidad = 0;
    this.tipoPenalidad = null;

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

  _avanzarTurno(saltar = false) {
    logContext(logger, this);
    const n = this.jugadores.length;
    const pasos = saltar ? 2 : 1;
    this.turnoIdx = (((this.turnoIdx + this.sentido * pasos) % n) + n) % n;
  }

  // ─── Jugadas ─────────────────────────────────────────────────────────────

  jugarCarta(jugadorId, cartaId, colorElegido) {
    logContext(logger, this);
    if (this.estado !== 'jugando') return { error: 'La partida no está en curso' };

    const jugador = this.jugadorEnTurno();
    if (jugador.jugadorId !== jugadorId) return { error: 'No es tu turno' };

    const carta = jugador.mano.find((c) => c.id === cartaId);
    if (!carta) return { error: 'No tenés esa carta' };

    // Modo libre: se puede jugar cualquier carta sin aplicar efectos.
    this.penalidad = 0;
    this.tipoPenalidad = null;

    jugador.quitarCarta(cartaId);

    this.descarte.push(carta);

    if (jugador.gano) {
      return this._cerrarRonda(jugadorId);
    }

    this._avanzarTurno(false);

    return { ok: true, carta, turnoIdx: this.turnoIdx, sentido: this.sentido };
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
      case 'roba-tres':
        this.penalidad += 3;
        this.tipoPenalidad = 'roba-tres';
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

  cantarUno(jugadorId) {
    logContext(logger, this);
    const jugador = this.jugadores.find((j) => j.jugadorId === jugadorId);
    if (!jugador) return { error: 'Jugador no encontrado' };
    if (!jugador.tieneUna) return { error: 'Solo podés cantar UNO cuando te queda 1 carta' };

    jugador.cantóUno = true;
    return { ok: true };
  }

  denunciarUno(denuncianteId, acusadoId) {
    logContext(logger, this);
    const acusado = this.jugadores.find((j) => j.jugadorId === acusadoId);
    if (!acusado) return { error: 'Jugador no encontrado' };
    if (!acusado.tieneUna || acusado.cantóUno) return { error: 'Denuncia inválida' };

    this._robarDelMazo(acusado, 2);
    return { ok: true, acusado: acusado.nombreUsuario };
  }

  // ─── Ronda / Partida ─────────────────────────────────────────────────────

  _cerrarRonda(ganadorId) {
    logContext(logger, this);
    let PUNTAJE_PARA_GANAR = 500;

    let puntosGanados = 0;

    for (const j of this.jugadores) {
      if (j.jugadorId === ganadorId) continue;
      puntosGanados += j.mano.reduce((sum, c) => sum + c.valor, 0);
    }

    this.puntajesRonda[ganadorId] = (this.puntajesRonda[ganadorId] || 0) + puntosGanados;

    if (this.puntajesRonda[ganadorId] >= PUNTAJE_PARA_GANAR) {
      return this._cerrarPartida(ganadorId);
    }

    this._iniciarRonda();

    return {
      ok: true,
      rondaTerminada: true,
      ganadorRonda: ganadorId,
      puntosGanados,
      puntajesRonda: { ...this.puntajesRonda },
    };
  }

  _cerrarPartida(ganadorId) {
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

    return { ok: true, partidaTerminada: true, ranking };
  }

  jugadorAbandonó(jugadorId) {
    logContext(logger, this);
    this.estado = 'terminada';

    const jugador = this.jugadores.find((j) => j.jugadorId === jugadorId);

    return { nombreUsuario: jugador?.nombreUsuario };
  }

  // Saca un jugador de la sala mientras está en 'esperando' (libera el slot).
  // Si el jugador era el creador, devuelve el id del nuevo creador (primer humano restante)
  // o null si no quedan humanos.
  removerJugador(jugadorId) {
    logContext(logger, this);
    const idx = this.jugadores.findIndex((j) => j.jugadorId === jugadorId);
    if (idx === -1) return { error: 'Jugador no estaba en la sala' };

    const [jugador] = this.jugadores.splice(idx, 1);
    delete this.puntajesRonda[jugadorId];

    let nuevoCreadorId = this.creadorId;
    if (jugadorId === this.creadorId) {
      const nuevoCreador = this.jugadores.find((j) => !j.esBot);
      nuevoCreadorId = nuevoCreador ? nuevoCreador.jugadorId : null;
      this.creadorId = nuevoCreadorId;
    }

    return { ok: true, nombreUsuario: jugador.nombreUsuario, nuevoCreadorId };
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
      turno: this.jugadores[this.turnoIdx]?.jugadorId,
      sentido: this.sentido,
      cartaEnMesa: enMesa,
      descarte: descarteVisible,
      penalidad: this.penalidad,
      jugadores: this.jugadores.map((j) => ({
        jugadorId: j.jugadorId,
        nombreUsuario: j.nombreUsuario,
        cantidadCartas: j.cantidadCartas,
        mano: j.jugadorId === jugadorId ? j.mano : undefined,
      })),
      puntajesRonda: this.puntajesRonda,
    };
  }
}

module.exports = SalaDeJuego;

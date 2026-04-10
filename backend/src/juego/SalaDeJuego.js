const { v4: uuidv4 } = require('uuid');
const { crearMazo, valorCarta, mezclar } = require('./Mazo');

const TIPOS_ACUMULABLES = new Set(['roba-dos', 'roba-tres', 'roba-cuatro']);

class SalaDeJuego {
  constructor(partidaId, creadorId, maxJugadores) {
    this.partidaId = partidaId;
    this.creadorId = creadorId;
    this.maxJugadores = maxJugadores; // 2-4
    this.estado = 'esperando'; // esperando | jugando | terminada

    this.jugadores = []; // [{ jugadorId, nombreUsuario, mano, puntajeRonda }]
    this.mazo = [];
    this.descarte = [];
    this.turnoIdx = 0;
    this.sentido = 1; // 1 = horario, -1 = antihorario
    this.penalidad = 0; // cartas acumuladas por +2/+3/+4
    this.tipoPenalidad = null; // tipo de carta que inició la acumulación
    this.puntajesRonda = {}; // jugadorId -> puntos acumulados en rondas
  }

  // ─── Sala ────────────────────────────────────────────────────────────────

  agregarBot(nombreBot) {
    if (this.jugadores.length >= this.maxJugadores) return null;

    const botId = `bot-${uuidv4()}`;

    this.jugadores.push({
      jugadorId: botId,
      nombreUsuario: nombreBot,
      mano: [],
      cantóUno: false,
      esBot: true,
    });

    this.puntajesRonda[botId] = 0;

    return botId;
  }

  agregarJugador(jugadorId, nombreUsuario) {
    if (this.estado !== 'esperando') return { error: 'La partida ya comenzó' };

    if (this.jugadores.length >= this.maxJugadores) return { error: 'Sala llena' };

    if (this.jugadores.find((j) => j.jugadorId === jugadorId))
      return { error: 'Ya estás en la sala' };

    this.jugadores.push({ jugadorId, nombreUsuario, mano: [], cantóUno: false });

    this.puntajesRonda[jugadorId] = 0;

    return { ok: true };
  }

  resumenPublico() {
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
    if (jugadorId !== this.creadorId) return { error: 'Solo el creador puede iniciar' };

    if (this.estado !== 'esperando') return { error: 'La partida ya comenzó' };

    if (this.jugadores.length < 2) return { error: 'Se necesitan al menos 2 jugadores' };

    this.estado = 'jugando';

    this._iniciarRonda();

    return { ok: true };
  }

  _iniciarRonda() {
    this.mazo = crearMazo();
    this.descarte = [];
    this.turnoIdx = 0;
    this.sentido = 1;
    this.penalidad = 0;
    this.tipoPenalidad = null;

    // Repartir 7 cartas
    for (const j of this.jugadores) {
      j.mano = this.mazo.splice(0, 7);

      j.cantóUno = false;
    }

    // Primera carta del descarte (no puede ser comodín)
    let primera;

    do {
      primera = this.mazo.shift();

      if (primera.color === null) this.mazo.push(primera);
    } while (primera.color === null);

    this.descarte.push(primera);
  }

  // ─── Turno ───────────────────────────────────────────────────────────────

  jugadorEnTurno() {
    return this.jugadores[this.turnoIdx];
  }

  turnoEsBot() {
    return !!this.jugadorEnTurno()?.esBot;
  }

  estadoParaBot() {
    const bot = this.jugadorEnTurno();
    const cartaEnMesa = this.descarte[this.descarte.length - 1];
    const rivales = this.jugadores
      .filter((j) => j.jugadorId !== bot.jugadorId)
      .map((j) => ({ nombre: j.nombreUsuario, cantidadCartas: j.mano.length }));
    return {
      mano: bot.mano,
      cartaEnMesa,
      penalidad: this.penalidad,
      tipoPenalidad: this.tipoPenalidad,
      rivales,
    };
  }

  _avanzarTurno(saltar = false) {
    const n = this.jugadores.length;

    let pasos = saltar ? 2 : 1;

    this.turnoIdx = (((this.turnoIdx + this.sentido * pasos) % n) + n) % n;
  }

  // ─── Jugadas ─────────────────────────────────────────────────────────────

  jugarCarta(jugadorId, cartaId, colorElegido) {
    if (this.estado !== 'jugando') return { error: 'La partida no está en curso' };

    const jugador = this.jugadorEnTurno();

    if (jugador.jugadorId !== jugadorId) return { error: 'No es tu turno' };

    const idxCarta = jugador.mano.findIndex((c) => c.id === cartaId);

    if (idxCarta === -1) return { error: 'No tenés esa carta' };

    const carta = jugador.mano[idxCarta];

    const enMesa = this.descarte[this.descarte.length - 1];

    // Validar jugada
    const valida = this._esJugadaValida(carta, enMesa);

    if (!valida) return { error: 'Jugada inválida' };

    // Sacar carta de la mano
    jugador.mano.splice(idxCarta, 1);

    // Asignar color si es comodín
    if (carta.color === null) {
      if (!colorElegido) return { error: 'Debés elegir un color' };

      carta.colorElegido = colorElegido;
    }

    this.descarte.push(carta);

    // ¿Ganó la ronda?
    if (jugador.mano.length === 0) {
      return this._cerrarRonda(jugadorId);
    }

    // Aplicar efectos
    const resultado = this._aplicarEfecto(carta);

    return { ok: true, carta, ...resultado };
  }

  _esJugadaValida(carta, enMesa) {
    // Siempre se puede jugar un comodín
    if (carta.color === null) {
      // Si hay penalidad activa, solo se puede apilar del mismo tipo
      if (this.penalidad > 0)
        return TIPOS_ACUMULABLES.has(carta.tipo) && carta.tipo === this.tipoPenalidad;

      return true;
    }

    // Si hay penalidad activa, solo se puede apilar
    if (this.penalidad > 0) {
      return TIPOS_ACUMULABLES.has(carta.tipo) && carta.tipo === this.tipoPenalidad;
    }

    const colorMesa = enMesa.colorElegido || enMesa.color;

    return (
      carta.color === colorMesa ||
      carta.tipo === enMesa.tipo ||
      (carta.tipo === 'numero' && enMesa.tipo === 'numero' && carta.numero === enMesa.numero)
    );
  }

  _aplicarEfecto(carta) {
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

    if (saltar && !TIPOS_ACUMULABLES.has(carta.tipo)) this._avanzarTurno(false);

    return { turnoIdx: this.turnoIdx, sentido: this.sentido };
  }

  robarCarta(jugadorId) {
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
    const robadas = [];

    for (let i = 0; i < cantidad; i++) {
      if (this.mazo.length === 0) {
        // Reciclar descarte (dejar la última carta)
        const ultima = this.descarte.pop();

        this.mazo = mezclar(this.descarte);

        this.descarte = [ultima];
      }
      if (this.mazo.length > 0) {
        const carta = this.mazo.shift();

        jugador.mano.push(carta);

        robadas.push(carta);
      }
    }
    return robadas;
  }

  cantarUno(jugadorId) {
    const jugador = this.jugadores.find((j) => j.jugadorId === jugadorId);

    if (!jugador) return { error: 'Jugador no encontrado' };

    if (jugador.mano.length !== 1)
      return { error: 'Solo podés cantar UNO cuando te queda 1 carta' };

    jugador.cantóUno = true;

    return { ok: true };
  }

  denunciarUno(denuncianteId, acusadoId) {
    const acusado = this.jugadores.find((j) => j.jugadorId === acusadoId);

    if (!acusado) return { error: 'Jugador no encontrado' };

    if (acusado.mano.length !== 1 || acusado.cantóUno) return { error: 'Denuncia inválida' };

    // El acusado roba 2
    this._robarDelMazo(acusado, 2);

    return { ok: true, acusado: acusado.nombreUsuario };
  }

  // ─── Ronda / Partida ─────────────────────────────────────────────────────

  _cerrarRonda(ganadorId) {
    let puntosGanados = 0;

    for (const j of this.jugadores) {
      if (j.jugadorId === ganadorId) continue;

      puntosGanados += j.mano.reduce((sum, c) => sum + valorCarta(c), 0);
    }

    this.puntajesRonda[ganadorId] = (this.puntajesRonda[ganadorId] || 0) + puntosGanados;

    // ¿Alguien llegó a 500?
    if (this.puntajesRonda[ganadorId] >= 500) {
      return this._cerrarPartida(ganadorId);
    }

    // Nueva ronda
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
    this.estado = 'terminada';

    // Ordenar por puntaje de ronda
    const ranking = this.jugadores
      .map((j) => ({
        jugadorId: j.jugadorId,
        nombre: j.nombreUsuario,
        puntaje: this.puntajesRonda[j.jugadorId] || 0,
      }))
      .sort((a, b) => b.puntaje - a.puntaje);

    const deltas = [50, 0, -25, -50];

    ranking.forEach((r, i) => {
      r.deltaGlobal = deltas[i] || -50;
    });

    return {
      ok: true,
      partidaTerminada: true,
      ranking,
    };
  }

  jugadorAbandonó(jugadorId) {
    this.estado = 'terminada';

    const jugador = this.jugadores.find((j) => j.jugadorId === jugadorId);

    return { nombreUsuario: jugador?.nombreUsuario };
  }

  // Vista del estado para un jugador específico
  estadoParaJugador(jugadorId) {
    const enMesa = this.descarte[this.descarte.length - 1] || null;

    return {
      partidaId: this.partidaId,
      estado: this.estado,
      turno: this.jugadores[this.turnoIdx]?.jugadorId,
      sentido: this.sentido,
      cartaEnMesa: enMesa,
      penalidad: this.penalidad,
      jugadores: this.jugadores.map((j) => ({
        jugadorId: j.jugadorId,
        nombreUsuario: j.nombreUsuario,
        cantidadCartas: j.mano.length,
        // solo la mano propia es visible
        mano: j.jugadorId === jugadorId ? j.mano : undefined,
      })),
      puntajesRonda: this.puntajesRonda,
    };
  }
}

module.exports = SalaDeJuego;

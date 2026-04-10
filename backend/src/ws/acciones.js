const almacen = require('../juego/almacen');
const { decidirJugada } = require('../juego/BotLLM');

// ctx = { sala, jugadorId, partidaId, jugador, emitirA, emitirATodos }

// ─── Bot ─────────────────────────────────────────────────────────────────────

async function ejecutarTurnoBot(sala, partidaId, emitirA, emitirATodos) {
  if (!sala.turnoEsBot()) return;

  const bot = sala.jugadorEnTurno();

  // Pequeño delay para que se sienta natural
  await new Promise((r) => setTimeout(r, 1200));

  if (!sala.turnoEsBot()) return; // el estado puede haber cambiado

  try {
    const { mano, cartaEnMesa, penalidad, tipoPenalidad, rivales } = sala.estadoParaBot();

    const decision = await decidirJugada(mano, cartaEnMesa, penalidad, tipoPenalidad, rivales);

    if (decision.robar) {
      const res = sala.robarCarta(bot.jugadorId);
      if (res.error) {
        console.error('[Bot] Error al robar:', res.error);
        return;
      }
      emitirATodos(sala, 'turno-cambiado', {
        turno: sala.jugadorEnTurno().jugadorId,
        sentido: sala.sentido,
        penalidad: 0,
        robó: { jugadorId: bot.jugadorId, cantidad: res.cantidad },
      });
    } else {
      const res = sala.jugarCarta(bot.jugadorId, decision.cartaId, decision.colorElegido);

      if (res.error) {
        // Jugada inválida → forzar robo para no bloquear
        console.error('[Bot] Jugada inválida, forzando robo:', res.error);
        const resRobo = sala.robarCarta(bot.jugadorId);
        emitirATodos(sala, 'turno-cambiado', {
          turno: sala.jugadorEnTurno().jugadorId,
          sentido: sala.sentido,
          penalidad: 0,
          robó: { jugadorId: bot.jugadorId, cantidad: resRobo.cantidad },
        });
      } else if (res.partidaTerminada) {
        res.ranking.forEach((r) => almacen.ajustarPuntajeGlobal(r.jugadorId, r.deltaGlobal));
        emitirATodos(sala, 'partida-terminada', { ranking: res.ranking });
        almacen.eliminarPartida(partidaId);
        return;
      } else if (res.rondaTerminada) {
        emitirATodos(sala, 'ronda-terminada', {
          ganadorRonda: res.ganadorRonda,
          puntosGanados: res.puntosGanados,
          puntajesRonda: res.puntajesRonda,
        });
        for (const j of sala.jugadores) {
          emitirA(j.jugadorId, 'estado-partida', { estado: sala.estadoParaJugador(j.jugadorId) });
        }
        return;
      } else {
        // Cantar UNO después de jugar si le queda 1 carta
        if (bot.mano.length === 1) {
          sala.cantarUno(bot.jugadorId);
          emitirATodos(sala, 'uno-cantado', { jugadorId: bot.jugadorId, nombreUsuario: bot.nombreUsuario });
        }
        emitirATodos(sala, 'carta-jugada', { jugadorId: bot.jugadorId, carta: res.carta });
        emitirATodos(sala, 'turno-cambiado', {
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
    ejecutarTurnoBot(sala, partidaId, emitirA, emitirATodos);
  }
}

// ─── Acciones humanas ────────────────────────────────────────────────────────

function iniciarPartida(ctx) {
  const { sala, jugadorId, partidaId, emitirA, emitirATodos } = ctx;

  const res = sala.iniciar(jugadorId);
  if (res.error) return emitirA(jugadorId, 'error', { mensaje: res.error });

  for (const j of sala.jugadores) {
    emitirA(j.jugadorId, 'estado-partida', { estado: sala.estadoParaJugador(j.jugadorId) });
  }

  emitirATodos(sala, 'turno-cambiado', {
    turno: sala.jugadorEnTurno().jugadorId,
    sentido: sala.sentido,
  });

  if (sala.turnoEsBot()) {
    ejecutarTurnoBot(sala, partidaId, emitirA, emitirATodos);
  }
}

function jugarCarta(ctx, payload) {
  const { sala, jugadorId, partidaId, emitirA, emitirATodos } = ctx;

  const { cartaId, colorElegido } = payload;

  const res = sala.jugarCarta(jugadorId, cartaId, colorElegido);

  if (res.error) return emitirA(jugadorId, 'error', { mensaje: res.error });

  if (res.partidaTerminada) {
    res.ranking.forEach((r) => almacen.ajustarPuntajeGlobal(r.jugadorId, r.deltaGlobal));

    emitirATodos(sala, 'partida-terminada', { ranking: res.ranking });

    almacen.eliminarPartida(partidaId);

    return;
  }

  if (res.rondaTerminada) {
    emitirATodos(sala, 'ronda-terminada', {
      ganadorRonda: res.ganadorRonda,
      puntosGanados: res.puntosGanados,
      puntajesRonda: res.puntajesRonda,
    });

    for (const j of sala.jugadores) {
      emitirA(j.jugadorId, 'estado-partida', { estado: sala.estadoParaJugador(j.jugadorId) });
    }

    return;
  }

  emitirATodos(sala, 'carta-jugada', { jugadorId, carta: res.carta });

  emitirATodos(sala, 'turno-cambiado', {
    turno: sala.jugadorEnTurno().jugadorId,
    sentido: sala.sentido,
    penalidad: sala.penalidad,
  });

  if (sala.turnoEsBot()) {
    ejecutarTurnoBot(sala, partidaId, emitirA, emitirATodos);
  }
}

function robarCarta(ctx) {
  const { sala, jugadorId, partidaId, emitirA, emitirATodos } = ctx;

  const res = sala.robarCarta(jugadorId);
  if (res.error) return emitirA(jugadorId, 'error', { mensaje: res.error });

  emitirA(jugadorId, 'cartas-robadas', { cartasRobadas: res.cartasRobadas });
  emitirATodos(sala, 'turno-cambiado', {
    turno: sala.jugadorEnTurno().jugadorId,
    sentido: sala.sentido,
    penalidad: 0,
    robó: { jugadorId, cantidad: res.cantidad },
  });

  if (sala.turnoEsBot()) {
    ejecutarTurnoBot(sala, partidaId, emitirA, emitirATodos);
  }
}

function cantarUno(ctx) {
  const { sala, jugadorId, jugador, emitirA, emitirATodos } = ctx;

  const res = sala.cantarUno(jugadorId);
  if (res.error) return emitirA(jugadorId, 'error', { mensaje: res.error });

  emitirATodos(sala, 'uno-cantado', { jugadorId, nombreUsuario: jugador.nombreUsuario });
}

function denunciarUno(ctx, payload) {
  const { sala, jugadorId, emitirA, emitirATodos } = ctx;
  const { acusadoId } = payload;

  const res = sala.denunciarUno(jugadorId, acusadoId);
  if (res.error) return emitirA(jugadorId, 'error', { mensaje: res.error });

  emitirATodos(sala, 'uno-denunciado', { denuncianteId: jugadorId, acusado: res.acusado });
}

module.exports = { iniciarPartida, jugarCarta, robarCarta, cantarUno, denunciarUno };

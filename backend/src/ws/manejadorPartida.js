const almacen = require('../juego/almacen');
const acciones = require('./acciones');

// jugadorId -> WebSocket
const conexiones = new Map();

function emitirATodos(sala, evento, datos) {
  for (const jugador of sala.jugadores) {
    const ws = conexiones.get(jugador.jugadorId);

    if (ws?.readyState === 1) {
      ws.send(JSON.stringify({ evento, ...datos }));
    }
  }
}

function emitirA(jugadorId, evento, datos) {
  const ws = conexiones.get(jugadorId);

  if (ws?.readyState === 1) {
    ws.send(JSON.stringify({ evento, ...datos }));
  }
}

function manejarConexion(ws, jugadorId, partidaId) {
  conexiones.set(jugadorId, ws);

  const sala = almacen.obtenerPartida(partidaId);

  if (!sala) {
    ws.send(JSON.stringify({ evento: 'error', mensaje: 'Partida no encontrada' }));

    ws.close();

    return;
  }

  const jugador = almacen.obtenerJugador(jugadorId);

  if (!jugador) {
    ws.send(JSON.stringify({ evento: 'error', mensaje: 'Jugador no encontrado' }));

    ws.close();

    return;
  }

  // Si el jugador no está en la sala aún, unirlo
  if (!sala.jugadores.find((j) => j.jugadorId === jugadorId)) {
    const resultado = sala.agregarJugador(jugadorId, jugador.nombreUsuario);

    if (resultado.error) {
      ws.send(JSON.stringify({ evento: 'error', mensaje: resultado.error }));

      ws.close();

      return;
    }

    emitirATodos(sala, 'jugador-unido', {
      jugadorId,
      nombreUsuario: jugador.nombreUsuario,
      totalJugadores: sala.jugadores.length,
    });
  }

  // Enviar estado actual al que se conectó
  ws.send(JSON.stringify({ evento: 'estado-partida', estado: sala.estadoParaJugador(jugadorId) }));

  ws.on('message', (raw) => {
    let mensaje;

    try {
      mensaje = JSON.parse(raw);
    } catch {
      return;
    }

    const { accion, ...payload } = mensaje;

    const ctx = { sala, jugadorId, partidaId, jugador, emitirA, emitirATodos };

    switch (accion) {
      case 'iniciar-partida':
        acciones.iniciarPartida(ctx);
        break;
      case 'jugar-carta':
        acciones.jugarCarta(ctx, payload);
        break;
      case 'robar-carta':
        acciones.robarCarta(ctx);
        break;
      case 'cantar-uno':
        acciones.cantarUno(ctx);
        break;
      case 'denunciar-uno':
        acciones.denunciarUno(ctx, payload);
        break;
      default:
        emitirA(jugadorId, 'error', { mensaje: `Acción desconocida: ${accion}` });
    }
  });

  ws.on('close', () => {
    conexiones.delete(jugadorId);

    const sala = almacen.obtenerPartida(partidaId);

    if (!sala || sala.estado === 'terminada') return;

    almacen.ajustarPuntajeGlobal(jugadorId, -50);

    const info = sala.jugadorAbandonó(jugadorId);

    emitirATodos(sala, 'jugador-abandono', {
      jugadorId,
      nombreUsuario: info.nombreUsuario,
      mensaje: 'La partida fue cancelada por abandono',
    });

    almacen.eliminarPartida(partidaId);
  });
}

module.exports = { manejarConexion };

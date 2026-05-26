const logger = require('../logger');
const { logContext } = require('../utils');

class ManejadorMensajes {
  constructor(controller, conexiones) {
    logContext(logger, this);
    this.controller = controller;
    this.conexiones = conexiones;
  }

  async manejarConexion(ws, jugadorId, partidaId) {
    logContext(logger, this);
    this.conexiones.registrar(jugadorId, ws);
    let abandonoExplicito = false;

    const res = await this.controller.unirJugador(partidaId, jugadorId);

    if (res.error) {
      ws.close();
      this.conexiones.desregistrar(jugadorId);
      return;
    }

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
            this.controller.iniciarPartida(partidaId, jugadorId);
            break;
          case 'jugar-carta':
            await this.controller.jugarCarta(
              partidaId,
              jugadorId,
              payload.cartaId,
              payload.colorElegido
            );
            break;
          case 'robar-carta':
            this.controller.robarCarta(partidaId, jugadorId);
            break;
          case 'cantar-uno':
            this.controller.cantarUno(partidaId, jugadorId);
            break;
          case 'denunciar-uno':
            this.controller.denunciarUno(partidaId, jugadorId, payload.acusadoId);
            break;
          case 'abandonar-partida':
            abandonoExplicito = true;
            await this.controller.abandonarPartida(partidaId, jugadorId);
            ws.close();
            break;
          case 'chat':
            this.controller.enviarMensajeChat(partidaId, jugadorId, payload.texto);
            break;
          default:
            this.conexiones.emitirA(jugadorId, 'error', {
              mensaje: `Acción desconocida: ${accion}`,
            });
        }
      } catch (err) {
        console.error('[WS] Error procesando mensaje:', err);
      }
    });

    ws.on('close', () => {
      this.conexiones.desregistrar(jugadorId);
      if (abandonoExplicito) return;
      this.controller.desconectar(partidaId, jugadorId).catch((err) => {
        console.error('[WS] Error al desconectar jugador:', err);
      });
    });
  }
}

module.exports = ManejadorMensajes;

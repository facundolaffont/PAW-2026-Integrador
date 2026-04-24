class ManejadorMensajes {
  constructor(controller, conexiones) {
    this.controller = controller;
    this.conexiones = conexiones;
  }

  async manejarConexion(ws, jugadorId, partidaId) {
    this.conexiones.registrar(jugadorId, ws);

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
            await this.controller.jugarCarta(partidaId, jugadorId, payload.cartaId, payload.colorElegido);
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
          default:
            this.conexiones.emitirA(jugadorId, 'error', { mensaje: `Acción desconocida: ${accion}` });
        }
      } catch (err) {
        console.error('[WS] Error procesando mensaje:', err);
      }
    });

    ws.on('close', () => {
      this.conexiones.desregistrar(jugadorId);
      this.controller.desconectar(partidaId, jugadorId);
    });
  }
}

module.exports = ManejadorMensajes;

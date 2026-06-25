const logger = require('../../infraestructura/shared/logger');
const { logContext } = require('../../infraestructura/shared/utils');

/**
 * ManejadorMensajes es responsable de manejar las conexiones WebSocket de los
 * jugadores, procesar los mensajes entrantes y delegar las acciones
 * correspondientes al controlador de partidas.
 */
class ManejadorMensajes {
  /** @type {PartidaController} */
  #partidaController;

  /** @type {ManejadorConexiones} */
  #manejadorConexiones;

  /**
   * @param {PartidaController} partidaController - El controlador de partidas
   * que se utilizará para manejar la lógica del juego.
   * @param {ManejadorConexiones} manejadorConexiones - El manejador de
   * conexiones para registrar y desregistrar las conexiones WebSocket de los
   * jugadores.
   */
  constructor(partidaController, manejadorConexiones) {
    logContext(logger, this);

    this.#partidaController = partidaController;
    this.#manejadorConexiones = manejadorConexiones;
  }

  /**
   * Guarda en memoria la conexión WebSocket del jugador, lo une a la partida
   * correspondiente y define los callbacks para el evento de mensaje entrante y
   * para el de cierre de la conexión. Según la acción indicada en el evento de
   * mensaje, se llama al método correspondiente del controlador de partidas
   * para ejecutar la lógica del juego.
   *
   * Utiliza:
   * - this.#partidaController.
   * - this.#manejadorConexiones.
   *
   * @param {import('ws').WebSocket} webSocket - Conexión WebSocket del jugador.
   * @param {Number} jugadorId - Identificador numérico del jugador.
   * @param {Number} partidaId - Identificador numérico de la partida.
   * @returns {Promise<void>}
   */
  async manejarConexion(webSocket, jugadorId, partidaId) {
    logContext(logger, this);

    // Guarda en memoria la conexión WebSocket del jugador.
    this.#manejadorConexiones.registrar(jugadorId, webSocket);

    let abandonoExplicito = false;

    // Intenta unir al jugador a la partida. Si lo logra, obtiene un resultado con formato {ok: true}.
    // Si no lo logra, obtiene un resultado con formato {error: '<mensaje>'}.
    const res = await this.#partidaController.unirJugador(partidaId, jugadorId);

    // Si hubo un error al unir al jugador a la partida, cierra la conexión WebSocket y desregistra al jugador.
    if (res.error) {
      webSocket.close();
      this.#manejadorConexiones.desregistrar(jugadorId);
      return;
    }

    // Define un manejador para los mensajes entrantes del cliente a través del WebSocket.
    // Se espera que cada mensaje tenga un formato JSON con una propiedad "accion",
    // que indica la acción a realizar, y otras propiedades que forman el payload de
    // la acción. Según el valor de "accion", se llama al método correspondiente del
    // controlador de partidas para ejecutar la lógica del juego. Si se recibe una
    // acción desconocida, se envía un mensaje de error al cliente.
    webSocket.on(
      'message',
      async (
        datosCrudos // Es de tipo Buffer | ArrayBuffer | Buffer[], según lo definido en WebSocket.
      ) => {
        let mensaje;

        try {
          mensaje = JSON.parse(datosCrudos);
        } catch {
          return;
        }

        const { accion, ...payload } = mensaje;

        try {
          switch (accion) {
            case 'iniciar-partida':
              this.#partidaController.iniciarPartida(partidaId, jugadorId);
              break;
            case 'jugar-carta':
              await this.#partidaController.jugarCarta(
                partidaId,
                jugadorId,
                payload.cartaId,
                payload.colorElegido
              );
              break;
            case 'robar-carta':
              this.#partidaController.robarCarta(partidaId, jugadorId);
              break;
            case 'abandonar-partida':
              abandonoExplicito = true;
              await this.#partidaController.abandonarPartida(partidaId, jugadorId);
              webSocket.close();
              break;
            case 'chat':
              this.#partidaController.enviarMensajeChat(partidaId, jugadorId, payload.texto);
              break;
            case 'continuar-ronda':
              this.#partidaController.continuarRonda(partidaId, jugadorId);
              break;
            case 'cantar-uno':
              this.#partidaController.cantarUno(partidaId, jugadorId);
              break;
            case 'animaciones-listas':
              this.#partidaController.animacionesListas(partidaId, jugadorId);
              break;
            default:
              this.#manejadorConexiones.emitirA(jugadorId, 'error', {
                mensaje: `Acción desconocida: ${accion}`,
              });
          }
        } catch (err) {
          console.error('[webSocket] Error procesando mensaje:', err);
        }
      }
    );

    // Define un manejador para el evento de cierre de la conexión WebSocket.
    // Cuando el cliente se desconecta, se desregistra su conexión y se notifica
    // al controlador de partidas para que ejecute la lógica de desconexión.
    webSocket.on('close', () => {
      this.#manejadorConexiones.desregistrar(jugadorId);
      if (abandonoExplicito) return;
      this.#partidaController.desconectar(partidaId, jugadorId).catch((err) => {
        console.error('[webSocket] Error al desconectar jugador:', err);
      });
    });
  }
}

module.exports = ManejadorMensajes;

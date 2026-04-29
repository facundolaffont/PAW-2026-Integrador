require('dotenv').config();
const http = require('http');
const path = require('path');
const express = require('express');
const { WebSocketServer } = require('ws');
const { URL } = require('url');

const db = require('./persistencia/Persistencia');
const BotLLM = require('./modelo/BotLLM');
const ManejadorConexiones = require('./ws/manejadorConexiones');
const PartidaController = require('./controladores/PartidaController');
const AuthController = require('./controladores/AuthController');
const PuntajesController = require('./controladores/PuntajesController');
const ManejadorMensajes = require('./ws/manejadorMensajes');
const ManejadorAuth = require('./http/manejadorAuth');
const ManejadorPartidas = require('./http/manejadorPartidas');
const ManejadorPuntajes = require('./http/manejadorPuntajes');

class Servidor {
  constructor(puerto) {
    this.puerto = puerto;
    this.app = express();

    // Crea un servidor HTTP utilizando el módulo `http` de Node.js,
    // pasando la aplicación Express como manejador de solicitudes.
    // Esto permite que el mismo servidor HTTP maneje tanto las solicitudes
    // HTTP normales como las conexiones WebSocket.
    this.server = http.createServer(this.app);

    // Crea un servidor WebSocket que se integrará con el servidor HTTP.
    // La opción `noServer: true` indica que el servidor WebSocket no escuchará
    // por sí mismo, sino que se le entregarán las conexiones HTTP existentes
    // que serán convertidas a WebSocket.
    this.wss = new WebSocketServer({ noServer: true });

    const conexiones = new ManejadorConexiones();
    const botLLM = new BotLLM();
    this.partidaController = new PartidaController(conexiones, db, botLLM);
    this.manejador = new ManejadorMensajes(this.partidaController, conexiones);

    /* Configuración de EJS y vistas. */

    // Configura Express para que utilice EJS como motor de plantillas para renderizar vistas HTML.
    // Esto permite que los archivos con extensión .ejs en el directorio de vistas sean procesados
    // por EJS para generar contenido HTML dinámico.
    this.app.set('view engine', 'ejs');

    // Establece el directorio donde se encuentran las plantillas EJS para renderizar las
    // vistas HTML.
    this.app.set('views', path.join(__dirname, '../public'));

    // Sirve archivos estáticos (CSS, imágenes, etc.), de forma tal que se puedan
    // referenciar desde los EJS con rutas absolutas (ejemplo, /styles/inicio.css).
    this.app.use(express.static(path.join(__dirname, '../public/resources/')));

    /* Configuración de middleware, rutas HTTP y WebSocket. */

    this.#configurarMiddleware();
    this.#configurarRutasHttp();
    this.#configurarWebSocket();
  }

  /**
   * Inicia el servidor HTTP y WebSocket.
   */
  iniciar() {
    this.server.listen(this.puerto, () => {
      console.log(`Servidor escuchando en http://localhost:${this.puerto}.`);
      console.log(
        `WebSocket disponible en ws://localhost:${this.puerto}/ws?jugadorId=X&partidaId=Y`
      );
    });
  }

  /**
   * Habilita el parseo de JSON en el cuerpo de las solicitudes HTTP.
   *
   * Middleware es un software que se ejecuta entre la recepción de una solicitud HTTP
   * y el envío de una respuesta. En este caso, `express.json()` es un middleware
   * que analiza el cuerpo de las solicitudes entrantes con contenido JSON y lo convierte
   * en un objeto JavaScript accesible a través de `req.body` en los manejadores de rutas.
   * Sin este middleware, `req.body` sería `undefined` para las solicitudes con JSON.
   */
  #configurarMiddleware() {
    this.app.use(express.json());
  }

  /**
   * Configura las rutas HTTP para el front y para la API REST.
   *
   * Asigna plantillas EJS a rutas específicas para renderizar vistas HTML para el frontend,
   * y crea instancias de los manejadores de rutas para la API REST, asignándolos a rutas
   * específicas, de forma tal que cada manejador define sus propias rutas internas y se
   * encarga de procesar las solicitudes que llegan a esas rutas.
   */
  #configurarRutasHttp() {
    // Rutas del frontend.
    this.app.get('/', (req, res) => {
      res.render('inicio');
    });
    this.app.get('/crear_sala', (req, res) => {
      res.render('crear_sala');
    });
    this.app.get('/partida', (req, res) => {
      res.render('partida');
    });
    this.app.get('/puntajes', (req, res) => {
      res.render('puntajes');
    });
    this.app.get('/salas', (req, res) => {
      res.render('salas');
    });

    // Rutas API REST.
    const auth = new ManejadorAuth(new AuthController(db));
    const partidas = new ManejadorPartidas(this.partidaController);
    const puntajes = new ManejadorPuntajes(new PuntajesController(db));
    this.app
      .use('/api', auth.router)
      .use('/api/partidas', partidas.router)
      .use('/api/puntajes', puntajes.router);
  }

  #configurarWebSocket() {
    // URL de conexión: ws://HOST:PORT?jugadorId=<id>&partidaId=<id>

    // Intercepta la solicitud HTTP de los clientes que intentan establecer una conexión
    // WebSocket. En este punto se validan los parametros requeridos y se rechazan
    // las conexiones invalidas con el código HTTP 400.
    this.server.on('upgrade', (req, socket, head) => {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const jugadorId = url.searchParams.get('jugadorId');
      const partidaId = url.searchParams.get('partidaId');

      // Valida que se hayan proporcionado los parámetros necesarios para identificar al
      // jugador y la partida. Si no, responde con un error HTTP 400 y cierra la conexión.
      if (!jugadorId || !partidaId) {
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
        socket.destroy();
        return;
      }

      // Completa el handshake HTTP WebSocket y entrega la conexión ya establecida
      // al manejador, que se encargará de gestionar la comunicación con el cliente
      // a través del socket WebSocket. Se maneja cualquier error que pueda ocurrir durante
      // la conexión y se cierra el socket en caso de que ocurra un error para evitar conexiones
      // colgadas.
      this.wss.handleUpgrade(req, socket, head, (ws) => {
        this.manejador.manejarConexion(ws, jugadorId, partidaId).catch((err) => {
          console.error('[WS] Error en conexión:', err);

          ws.close();
        });
      });
    });
  }
}

const puerto = process.env.PORT || 3000;
const servidor = new Servidor(puerto);
servidor.iniciar();

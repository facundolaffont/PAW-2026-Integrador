const dotenv = require('dotenv');
dotenv.config();

const http = require('http');
const path = require('path');
const express = require('express');
const { WebSocketServer } = require('ws');
const { URL } = require('url');
const axios = require('axios');

const logger = require('./logger');
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
const AppException = require('./errores/AppException');
const EmptyException = require('./errores/EmptyException');
const {
  isDevEnvConfigured,
  isEmptyObject,
  handleErrorByEnv,
  handleGenericErrorByEnv,
  registerLog,
  logContext,
} = require('./utils');
const errorhandler = require('errorhandler');

const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'UNO Argentino API',
      version: '1.0.0',
      description: 'Documentación interactiva de la API UNO Argentino',
    },
  },
  apis: [path.join(__dirname, './**/*.js')],
};
const swaggerSpec = swaggerJsdoc(swaggerOptions);

class Servidor {
  constructor(puerto) {
    this.puerto = puerto;
    this.app = express();

    // Documentación Swagger UI disponible en /api-docs
    this.app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

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

    // Middleware de errorhandler que sólo funciona en desarrollo.
    if (isDevEnvConfigured()) {
      this.app.use(errorhandler());
    }
  }

  /**
   * Inicia el servidor HTTP y WebSocket.
   */
  iniciar() {
    logContext(logger, this);

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
    logContext(logger, this);

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
    logContext(logger, this);

    /* Rutas del frontend. */

    this.app.get('/', (req, res) => {
      res.render('inicio', {
        title: 'UNO Argentino - Inicio',
        styles: ['/styles/inicio.css'],
      });
    });

    this.app.get('/crear-sala', (req, res) => {
      res.render('crear-sala', {
        title: 'UNO Argentino - Crear Sala',
        styles: ['/styles/crear-sala.css'],
      });
    });

    // Manejar el POST del formulario de creación de sala.
    this.app.post('/crear-sala', async (req, res, next) => {
      try {
        // Si el cuerpo de la solicitud no tiene información o es un objeto vacío,
        // lanza una excepción.
        if (isEmptyObject(req.body)) throw new EmptyException('Cuerpo HTTP sin información.');

        registerLog(logger, 'debug', 'Datos de sala recibidos.', { body: req.body });
        const jugadorId = 'UUID';
        const maxJugadores = parseInt(req.body.num_jugadores, 10);
        const cantidadBots = Math.max(0, maxJugadores - 2);
        const payload = {
          jugadorId,
          maxJugadores,
          cantidadBots,
        };

        registerLog(logger, 'debug', 'Payload a enviar al backend.', { payload });
        await axios.post('http://localhost:3000/api/partidas', payload, {
          headers: { 'Content-Type': 'application/json' },
        });

        res.redirect('/salas');
      } catch (error) {
        handleGenericErrorByEnv(error, next, res, 'Error al crear la sala.');
      }
    });

    this.app.get('/partida', (req, res) => {
      res.render('partida', {
        title: 'UNO Argentino - Partida',
        styles: ['/styles/partida.css'],
      });
    });

    this.app.get('/puntajes', (req, res) => {
      res.render('puntajes', {
        title: 'UNO Argentino - Puntajes',
        styles: ['/styles/puntajes.css'],
      });
    });

    this.app.get('/salas', (req, res) => {
      res.render('salas', {
        title: 'UNO Argentino - Salas',
        styles: ['/styles/salas.css'],
      });
    });

    /* Rutas del backend. */

    const auth = new ManejadorAuth(new AuthController(db));
    const partidas = new ManejadorPartidas(this.partidaController);
    const puntajes = new ManejadorPuntajes(new PuntajesController(db));
    this.app
      .use('/api', auth.router)
      .use('/api/partidas', partidas.router)
      .use('/api/puntajes', puntajes.router);
  }

  #configurarWebSocket() {
    logContext(logger, this);

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
          registerLog(logger, 'error', `[WS] Error en conexión: ${err.message}`, { error: err });

          ws.close();
        });
      });
    });
  }
}

const puerto = process.env.PORT || 3000;
const servidor = new Servidor(puerto);
servidor.iniciar();

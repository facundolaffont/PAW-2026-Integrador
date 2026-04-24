require('dotenv').config();
const http = require('http');
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
    this.server = http.createServer(this.app);
    this.wss = new WebSocketServer({ noServer: true });

    const conexiones = new ManejadorConexiones();
    const botLLM = new BotLLM();
    this.controller = new PartidaController(conexiones, db, botLLM);
    this.manejador = new ManejadorMensajes(this.controller, conexiones);

    this._configurarMiddleware();
    this._configurarRutasHttp();
    this._configurarWebSocket();
  }

  _configurarMiddleware() {
    this.app.use(express.json()); // Para parsear JSON en solicitudes HTTP
  }

  _configurarRutasHttp() {
    const auth = new ManejadorAuth(new AuthController(db));
    const partidas = new ManejadorPartidas(this.controller);
    const puntajes = new ManejadorPuntajes(new PuntajesController(db));

    this.app.use('/api', auth.router);
    this.app.use('/api/partidas', partidas.router);
    this.app.use('/api/puntajes', puntajes.router);
  }

  _configurarWebSocket() {
    // URL de conexión: ws://HOST:PORT?jugadorId=<id>&partidaId=<id>

    this.server.on('upgrade', (req, socket, head) => {
      const url = new URL(req.url, `http://${req.headers.host}`);

      const jugadorId = url.searchParams.get('jugadorId');

      const partidaId = url.searchParams.get('partidaId');

      if (!jugadorId || !partidaId) {
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');

        socket.destroy();

        return;
      }

      this.wss.handleUpgrade(req, socket, head, (ws) => {
        this.manejador.manejarConexion(ws, jugadorId, partidaId).catch((err) => {
          console.error('[WS] Error en conexión:', err);

          ws.close();
        });
      });
    });
  }

  iniciar() {
    this.server.listen(this.puerto, () => {
      console.log(`Servidor escuchando en http://localhost:${this.puerto}`);
      console.log(
        `WebSocket disponible en ws://localhost:${this.puerto}/ws?jugadorId=X&partidaId=Y`
      );
    });
  }
}

const puerto = process.env.PORT || 3000;

const servidor = new Servidor(puerto);

servidor.iniciar();

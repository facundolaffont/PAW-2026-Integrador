require('dotenv').config();
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');
const { URL } = require('url');

const ManejadorPartida = require('./src/ws/manejadorPartida');
const AuthController = require('./src/rutas/AuthController');
const PartidasController = require('./src/rutas/PartidasController');
const PuntajesController = require('./src/rutas/PuntajesController');

class Servidor {
  constructor(puerto) {
    this.puerto = puerto;
    this.app = express();
    this.server = http.createServer(this.app);
    this.wss = new WebSocketServer({ noServer: true });
    this.manejador = new ManejadorPartida();

    this._configurarMiddleware();
    this._configurarRutas();
    this._configurarWebSocket();
  }

  _configurarMiddleware() {
    this.app.use(express.json());

    this.app.use((req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

      if (req.method === 'OPTIONS') return res.sendStatus(204);

      next();
    });
  }

  _configurarRutas() {
    const auth = new AuthController();
    const partidas = new PartidasController();
    const puntajes = new PuntajesController();

    this.app.use('/api', auth.router);
    this.app.use('/api/partidas', partidas.router);
    this.app.use('/api/puntajes', puntajes.router);
  }

  // URL de conexión: ws://HOST:PORT?jugadorId=<id>&partidaId=<id>
  _configurarWebSocket() {
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

require('dotenv').config();
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');
const { URL } = require('url');

const authRutas = require('./src/rutas/auth');
const partidasRutas = require('./src/rutas/partidas');
const puntajesRutas = require('./src/rutas/puntajes');
const { manejarConexion } = require('./src/ws/manejadorPartida');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// CORS simple para desarrollo
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Frontend estático
app.use(express.static('public'));

// Rutas HTTP
app.use('/api', authRutas);
app.use('/api/partidas', partidasRutas);
app.use('/api/puntajes', puntajesRutas);


// Servidor HTTP compartido con WebSocket
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const jugadorId = url.searchParams.get('jugadorId');
  const partidaId = url.searchParams.get('partidaId');

  if (!jugadorId || !partidaId) {
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');

    socket.destroy();

    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    manejarConexion(ws, jugadorId, partidaId);
  });
});

server.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);

  console.log(`WebSocket disponible en ws://localhost:${PORT}/ws?jugadorId=X&partidaId=Y`);
});

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/Persistencia');
const SalaDeJuego = require('../juego/SalaDeJuego');

const NOMBRES_BOTS = ['Bot-A', 'Bot-B', 'Bot-C'];

class PartidasController {
  constructor() {
    this.router = express.Router();
    this._registrarRutas();
  }

  _registrarRutas() {
    this.router.get('/', (req, res) => this.listar(req, res));
    this.router.post('/', (req, res) => this.crear(req, res));
    this.router.get('/:id', (req, res) => this.obtener(req, res));
  }

  listar(req, res) {
    res.json(db.listarPartidasDisponibles());
  }

  crear(req, res) {
    const { jugadorId, maxJugadores, cantidadBots = 0 } = req.body;

    if (!jugadorId) return res.status(400).json({ error: 'jugadorId requerido' });

    const jugador = db.obtenerJugador(jugadorId);
    if (!jugador) return res.status(404).json({ error: 'Jugador no encontrado' });

    const bots = parseInt(cantidadBots);
    const total = 1 + bots;
    const max = maxJugadores ? parseInt(maxJugadores) : total;

    if (bots < 0 || bots > 3)
      return res.status(400).json({ error: 'cantidadBots debe ser entre 0 y 3' });

    if (total < 2 || total > 4)
      return res
        .status(400)
        .json({ error: 'El total de jugadores (humanos + bots) debe ser entre 2 y 4' });

    const partidaId = uuidv4();
    const sala = new SalaDeJuego(partidaId, jugadorId, max);

    sala.agregarJugador(jugadorId, jugador.nombreUsuario);

    for (let i = 0; i < bots; i++) {
      sala.agregarBot(NOMBRES_BOTS[i]);
    }

    db.guardarPartida(partidaId, sala);

    res.status(201).json({ partidaId, ...sala.resumenPublico() });
  }

  obtener(req, res) {
    const sala = db.obtenerPartida(req.params.id);
    if (!sala) return res.status(404).json({ error: 'Partida no encontrada' });

    res.json(sala.resumenPublico());
  }
}

module.exports = PartidasController;

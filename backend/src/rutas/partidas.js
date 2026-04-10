const express = require('express');
const { v4: uuidv4 } = require('uuid');
const almacen = require('../juego/almacen');
const SalaDeJuego = require('../juego/SalaDeJuego');

const router = express.Router();

const nombresBots = ['Bot-A', 'Bot-B', 'Bot-C'];

// GET /api/partidas — listar salas en espera
router.get('/', (req, res) => {
  res.json(almacen.listarPartidasDisponibles());
});

// POST /api/partidas — crear sala
// Body: { jugadorId, maxJugadores?, cantidadBots? }
// cantidadBots: cuántos bots agregar (0-3). El total jugador+bots debe ser entre 2 y 4.
router.post('/', (req, res) => {
  const { jugadorId, maxJugadores, cantidadBots = 0 } = req.body;

  if (!jugadorId) return res.status(400).json({ error: 'jugadorId requerido' });

  const jugador = almacen.obtenerJugador(jugadorId);

  if (!jugador) return res.status(404).json({ error: 'Jugador no encontrado' });

  const bots = parseInt(cantidadBots);
  const total = 1 + bots; // jugador humano + bots
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
    sala.agregarBot(nombresBots[i]);
  }

  almacen.guardarPartida(partidaId, sala);

  res.status(201).json({ partidaId, ...sala.resumenPublico() });
});

// GET /api/partidas/:id — estado de una sala
router.get('/:id', (req, res) => {
  const sala = almacen.obtenerPartida(req.params.id);

  if (!sala) return res.status(404).json({ error: 'Partida no encontrada' });

  res.json(sala.resumenPublico());
});

module.exports = router;

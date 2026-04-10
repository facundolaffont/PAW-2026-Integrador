const express = require('express');
const { v4: uuidv4 } = require('uuid');
const almacen = require('../juego/almacen');

const router = express.Router();

// POST /api/registrarse
router.post('/registrarse', (req, res) => {
  const { nombreUsuario } = req.body;

  if (!nombreUsuario?.trim()) return res.status(400).json({ error: 'nombreUsuario requerido' });

  if (almacen.obtenerJugadorPorNombre(nombreUsuario)) {
    return res.status(409).json({ error: 'El nombre de usuario ya existe' });
  }

  const jugadorId = uuidv4();

  almacen.registrarJugador(jugadorId, nombreUsuario.trim());

  res.status(201).json({ jugadorId, nombreUsuario: nombreUsuario.trim() });
});

// POST /api/ingresar
router.post('/ingresar', (req, res) => {
  const { nombreUsuario } = req.body;

  if (!nombreUsuario?.trim()) return res.status(400).json({ error: 'nombreUsuario requerido' });

  const jugador = almacen.obtenerJugadorPorNombre(nombreUsuario.trim());

  if (!jugador) return res.status(404).json({ error: 'Usuario no encontrado' });

  res.json({ jugadorId: jugador.jugadorId, nombreUsuario: jugador.nombreUsuario });
});

module.exports = router;

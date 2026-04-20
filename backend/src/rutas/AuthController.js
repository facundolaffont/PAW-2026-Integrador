const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/Persistencia');

class AuthController {
  constructor() {
    this.router = express.Router();
    this._registrarRutas();
  }

  _registrarRutas() {
    this.router.post('/registrarse', (req, res) => this.registrar(req, res));
    this.router.post('/ingresar', (req, res) => this.ingresar(req, res));
  }

  async registrar(req, res) {
    const { nombreUsuario } = req.body;

    if (!nombreUsuario?.trim()) return res.status(400).json({ error: 'nombreUsuario requerido' });

    if (await db.obtenerJugadorPorNombre(nombreUsuario)) {
      return res.status(409).json({ error: 'El nombre de usuario ya existe' });
    }

    const jugadorId = uuidv4();
    await db.registrarJugador(jugadorId, nombreUsuario.trim());

    res.status(201).json({ jugadorId, nombreUsuario: nombreUsuario.trim() });
  }

  async ingresar(req, res) {
    const { nombreUsuario } = req.body;

    if (!nombreUsuario?.trim()) return res.status(400).json({ error: 'nombreUsuario requerido' });

    const jugador = await db.obtenerJugadorPorNombre(nombreUsuario.trim());
    if (!jugador) return res.status(404).json({ error: 'Usuario no encontrado' });

    res.json({ jugadorId: jugador.jugadorId, nombreUsuario: jugador.nombreUsuario });
  }
}

module.exports = AuthController;

const express = require('express');
const almacen = require('../juego/almacen');

const router = express.Router();

// GET /api/puntajes — tabla global de puntajes
router.get('/', (req, res) => {
  res.json(almacen.obtenerPuntajes());
});

module.exports = router;

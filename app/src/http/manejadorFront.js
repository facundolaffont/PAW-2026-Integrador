const { isEmptyObject, logContext } = require('../utils');
const axios = require('axios');
const logger = require('../logger');

class ManejadorFront {
  constructor(app) {
    this.app = app;

    this.#registrarRutas();
  }

  #registrarRutas() {
    /**
     * Rutas del frontend.
     * Se podrían separar en un manejador específico si se quisiera, pero dado que el frontend es muy simple y no tiene lógica de negocio, lo dejo aquí para evitar agregar complejidad innecesaria.
     */
    this.app.get('/', (req, res) => res.redirect('/public/bienvenida'));

    this.app.get('/public/bienvenida', (req, res) => {
      res.render('bienvenida', {
        title: 'UNO Argentino - Bienvenida',
        styles: ['/styles/auth.css'],
      });
    });

    this.app.get('/public/', (req, res) => {
      res.render('inicio', {
        title: 'UNO Argentino - Inicio',
        styles: ['/styles/inicio.css'],
      });
    });

    this.app.get('/public/ingresar', (req, res) => {
      res.render('login', {
        title: 'UNO Argentino - Ingresar',
        styles: ['/styles/auth.css'],
      });
    });

    this.app.get('/public/registrarse', (req, res) => {
      res.render('registro', {
        title: 'UNO Argentino - Registrarse',
        styles: ['/styles/auth.css'],
      });
    });

    this.app.get('/public/nombre-jugador', (req, res) => {
      res.render('nombre-jugador', {
        title: 'UNO Argentino - Nombre de Jugador',
        styles: ['/styles/nombre-jugador.css'],
      });
    });

    this.app.get('/public/crear-sala', (req, res) => {
      res.render('crear-sala', {
        title: 'UNO Argentino - Crear Sala',
        styles: ['/styles/crear-sala.css'],
      });
    });

    // Manejar el POST del formulario de creación de sala.
    this.app.post('/public/crear-sala', async (req, res, next) => {
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

    this.app.get('/public/partida', (req, res) => {
      res.render('partida', {
        title: 'UNO Argentino - Partida',
        styles: ['/styles/partida.css'],
      });
    });

    this.app.get('/public/puntajes', (req, res) => {
      res.render('puntajes', {
        title: 'UNO Argentino - Puntajes',
        styles: ['/styles/puntajes.css'],
      });
    });

    this.app.get('/public/salas', (req, res) => {
      res.render('salas', {
        title: 'UNO Argentino - Salas',
        styles: ['/styles/salas.css'],
      });
    });
  }
}

module.exports = ManejadorFront;

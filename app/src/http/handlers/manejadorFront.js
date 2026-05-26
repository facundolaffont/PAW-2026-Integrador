const { logContext, registerLog } = require('../../utils');
const logger = require('../../logger');

class ManejadorFront {
  #logLevel = process.env.LOG_LEVEL || 'debug';

  constructor(app) {
    logContext(logger, this);
    this.app = app;

    this.#registrarRutas();
  }

  #registrarRutas() {
    logContext(logger, this);
    /**
     * Rutas del frontend.
     * Se podrían separar en un manejador específico si se quisiera, pero dado que el frontend es muy simple y no tiene lógica de negocio, lo dejo aquí para evitar agregar complejidad innecesaria.
     */
    this.app.get('/', (req, res) => res.redirect('/public/bienvenida'));

    this.app.get('/public/bienvenida', (req, res) => {
      res.render('bienvenida', {
        logLevel: this.#logLevel,
        title: 'UNO Argentino - Bienvenida',
        styles: ['/styles/auth.css'],
      });
    });

    this.app.get('/public/', (req, res) => {
      res.render('inicio', {
        logLevel: this.#logLevel,
        title: 'UNO Argentino - Inicio',
        styles: ['/styles/inicio.css'],
      });
    });

    this.app.get('/public/ingresar', (req, res) => {
      res.render('login', {
        logLevel: this.#logLevel,
        title: 'UNO Argentino - Ingresar',
        styles: ['/styles/auth.css'],
      });
    });

    this.app.get('/public/registrarse', (req, res) => {
      res.render('registro', {
        logLevel: this.#logLevel,
        title: 'UNO Argentino - Registrarse',
        styles: ['/styles/auth.css'],
      });
    });

    this.app.get('/public/jugar', (req, res) => {
      res.render('jugar', {
        logLevel: this.#logLevel,
        title: 'UNO Argentino - Jugar',
        styles: ['/styles/auth.css'],
      });
    });

    this.app.get('/public/nombre-jugador', (req, res) => {
      res.render('nombre-jugador', {
        logLevel: this.#logLevel,
        title: 'UNO Argentino - Nombre de Jugador',
        styles: ['/styles/nombre-jugador.css'],
      });
    });

    this.app.get('/public/crear-sala', (req, res) => {
      res.render('crear-sala', {
        logLevel: this.#logLevel,
        title: 'UNO Argentino - Crear Sala',
        styles: ['/styles/crear-sala.css'],
      });
    });

    this.app.get('/public/partida', (req, res) => {
      res.render('partida', {
        logLevel: this.#logLevel,
        title: 'UNO Argentino - Partida',
        styles: ['/styles/partida.css'],
      });
    });

    this.app.get('/public/puntajes', (req, res) => {
      res.render('puntajes', {
        logLevel: this.#logLevel,
        title: 'UNO Argentino - Puntajes',
        styles: ['/styles/puntajes.css'],
      });
    });

    this.app.get('/public/salas', (req, res) => {
      res.render('salas', {
        logLevel: this.#logLevel,
        title: 'UNO Argentino - Salas',
        styles: ['/styles/salas.css'],
      });
    });
  }
}

module.exports = ManejadorFront;

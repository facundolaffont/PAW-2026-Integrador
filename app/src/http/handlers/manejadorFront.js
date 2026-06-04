const { isEmptyObject, logContext, registerLog, handleGenericErrorByEnv } = require('../../utils');
const axios = require('axios');
const logger = require('../../logger');
const EmptyException = require('../../errores/EmptyException');
const { buildReglasLocals } = require('../seo/reglas');
const { requireAuthWeb } = require('../middleware/middlewareAuth');

class ManejadorFront {
  #logLevel = process.env.LOG_LEVEL || 'debug';
  #puntajesController;

  #buildSeoLocals(req, path) {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const seo = {
      canonicalUrl: `${baseUrl}${path}`,
      ogImage: `${baseUrl}/images/uno-logo.png`,
      ogUrl: `${baseUrl}${path}`,
    };

    return {
      seo,
      ...seo,
    };
  }

  constructor(app, puntajesController) {
    logContext(logger, this);
    this.app = app;
    this.#puntajesController = puntajesController;

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
        ...this.#buildSeoLocals(req, '/public/bienvenida'),
      });
    });

    this.app.get('/public/', requireAuthWeb, (req, res) => {
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

    this.app.get('/public/jugar', requireAuthWeb, (req, res) => {
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

    this.app.get('/public/crear-sala', requireAuthWeb, (req, res) => {
      res.render('crear-sala', {
        logLevel: this.#logLevel,
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

    this.app.get('/public/partida', requireAuthWeb, (req, res) => {
      res.render('partida', {
        logLevel: this.#logLevel,
        title: 'UNO Argentino - Partida',
        styles: ['/styles/partida.css'],
      });
    });

    this.app.get('/public/puntajes', async (req, res) => {
      const puntajes = this.#puntajesController
        ? await this.#puntajesController.listarPuntajes()
        : [];

      res.render('puntajes', {
        logLevel: this.#logLevel,
        title: 'UNO Argentino - Puntajes',
        styles: ['/styles/puntajes.css'],
        puntajes,
        ...this.#buildSeoLocals(req, '/public/puntajes'),
      });
    });

    this.app.get('/public/salas', requireAuthWeb, (req, res) => {
      res.render('salas', {
        logLevel: this.#logLevel,
        title: 'UNO Argentino - Salas',
        styles: ['/styles/salas.css'],
      });
    });

    this.app.get('/public/reglas', (req, res) => {
      res.render('reglas', { logLevel: this.#logLevel, ...buildReglasLocals(req) });
    });
  }
}

module.exports = ManejadorFront;

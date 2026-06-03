const { logContext } = require('../../utils');
const logger = require('../../logger');

class ManejadorFront {
  #logLevel = process.env.LOG_LEVEL || 'debug';

  constructor(app, puntajesController) {
    logContext(logger, this);
    this.app = app;
    this.puntajesController = puntajesController;

    this.#registrarRutas();
  }

  // Construye la URL base a partir del request (protocolo + host)
  #baseUrl(req) {
    return `${req.protocol}://${req.get('host')}`;
  }

  #registrarRutas() {
    logContext(logger, this);

    // ── Raíz ──────────────────────────────────────────────────────────────────
    this.app.get('/', (req, res) => res.redirect('/public/bienvenida'));

    // ── Bienvenida (landing pública, principal para SEO) ──────────────────────
    this.app.get('/public/bienvenida', (req, res) => {
      const base = this.#baseUrl(req);
      res.render('bienvenida', {
        logLevel:      this.#logLevel,
        title:         'UNO Argentino — Jugá al UNO en línea, gratis y en español',
        description:   'UNO Argentino es un juego de cartas multijugador online gratuito. Creá tu cuenta, desafiá amigos o bots y competí en el ranking global.',
        canonicalUrl:  `${base}/public/bienvenida`,
        ogUrl:         `${base}/public/bienvenida`,
        ogImage:       `${base}/images/uno-logo.png`,
        ogTitle:       'UNO Argentino — Jugá al UNO en línea',
        ogDescription: 'El clásico juego de cartas UNO, ahora online, gratis y en español argentino.',
        styles:        ['/styles/auth.css'],
      });
    });

    // ── Inicio (app tras login, no indexable) ─────────────────────────────────
    this.app.get('/public/', (req, res) => {
      res.render('inicio', {
        logLevel: this.#logLevel,
        title:    'UNO Argentino - Inicio',
        robots:   'noindex, nofollow',
        styles:   ['/styles/inicio.css'],
      });
    });

    // ── Login (no indexable: formulario vacío, sin valor para el buscador) ────
    this.app.get('/public/ingresar', (req, res) => {
      res.render('login', {
        logLevel:    this.#logLevel,
        title:       'Ingresar — UNO Argentino',
        description: 'Ingresá a tu cuenta de UNO Argentino.',
        robots:      'noindex, nofollow',
        styles:      ['/styles/auth.css'],
      });
    });

    // ── Registro (no indexable) ───────────────────────────────────────────────
    this.app.get('/public/registrarse', (req, res) => {
      res.render('registro', {
        logLevel:    this.#logLevel,
        title:       'Registrarse — UNO Argentino',
        description: 'Creá tu cuenta gratuita en UNO Argentino.',
        robots:      'noindex, nofollow',
        styles:      ['/styles/auth.css'],
      });
    });

    // ── Puntajes / Ranking (SSR, pública e indexable) ─────────────────────────
    this.app.get('/public/puntajes', async (req, res) => {
      const base = this.#baseUrl(req);
      let puntajes = [];
      try {
        puntajes = await this.puntajesController.listarPuntajes() || [];
      } catch (_) {
        puntajes = [];
      }
      res.render('puntajes', {
        logLevel:      this.#logLevel,
        title:         'Ranking Global — UNO Argentino',
        description:   'Los mejores jugadores de UNO Argentino. Mirá el ranking global y descubrí quién lidera.',
        canonicalUrl:  `${base}/public/puntajes`,
        ogUrl:         `${base}/public/puntajes`,
        ogImage:       `${base}/images/uno-logo.png`,
        ogTitle:       'Ranking Global — UNO Argentino',
        ogDescription: 'Clasificación de los mejores jugadores de UNO Argentino.',
        styles:        ['/styles/puntajes.css'],
        puntajes,
      });
    });

    // ── Páginas internas (no indexables) ──────────────────────────────────────
    this.app.get('/public/jugar', (req, res) => {
      res.render('jugar', {
        logLevel: this.#logLevel,
        title:    'UNO Argentino - Jugar',
        robots:   'noindex, nofollow',
        styles:   ['/styles/auth.css'],
      });
    });

    this.app.get('/public/nombre-jugador', (req, res) => {
      res.render('nombre-jugador', {
        logLevel: this.#logLevel,
        title:    'UNO Argentino - Nombre de Jugador',
        robots:   'noindex, nofollow',
        styles:   ['/styles/nombre-jugador.css'],
      });
    });

    this.app.get('/public/crear-sala', (req, res) => {
      res.render('crear-sala', {
        logLevel: this.#logLevel,
        title:    'UNO Argentino - Crear Sala',
        robots:   'noindex, nofollow',
        styles:   ['/styles/crear-sala.css'],
      });
    });

    this.app.get('/public/partida', (req, res) => {
      res.render('partida', {
        logLevel: this.#logLevel,
        title:    'UNO Argentino - Partida',
        robots:   'noindex, nofollow',
        styles:   ['/styles/partida.css'],
      });
    });

    this.app.get('/public/salas', (req, res) => {
      res.render('salas', {
        logLevel: this.#logLevel,
        title:    'UNO Argentino - Salas',
        robots:   'noindex, nofollow',
        styles:   ['/styles/salas.css'],
      });
    });
  }
}

module.exports = ManejadorFront;

const { isEmptyObject, logContext, registerLog, handleGenericErrorByEnv } = require('#infraestructura/shared/utils');
const axios = require('axios');
const logger = require('#infraestructura/shared/logger');
const EmptyException = require('#errores/EmptyException');
const { buildReglasLocals } = require('#interfaces/http/seo/reglas');
const { requireAuthWeb } = require('#interfaces/http/middleware/middlewareAuth');

class ManejadorFront {
  #logLevel = process.env.LOG_LEVEL || 'debug';
  #puntajesController;
  #partidaController;

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

  constructor(app, puntajesController, partidaController) {
    logContext(logger, this);
    this.app = app;
    this.#puntajesController = puntajesController;
    this.#partidaController = partidaController;

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
        styles: ['/css/auth.css'],
        ...this.#buildSeoLocals(req, '/public/bienvenida'),
      });
    });

    this.app.get('/public/', requireAuthWeb, (req, res) => {
      res.render('inicio', {
        logLevel: this.#logLevel,
        title: 'UNO Argentino - Inicio',
        styles: ['/css/inicio.css'],
      });
    });

    this.app.get('/public/ingresar', (req, res) => {
      res.render('login', {
        logLevel: this.#logLevel,
        title: 'UNO Argentino - Ingresar',
        styles: ['/css/auth.css'],
      });
    });

    this.app.get('/public/registrarse', (req, res) => {
      res.render('registro', {
        logLevel: this.#logLevel,
        title: 'UNO Argentino - Registrarse',
        styles: ['/css/auth.css'],
      });
    });

    this.app.get('/public/jugar', requireAuthWeb, (req, res) => {
      res.render('jugar', {
        logLevel: this.#logLevel,
        title: 'UNO Argentino - Jugar',
        styles: ['/css/auth.css'],
      });
    });

    this.app.get('/public/nombre-jugador', (req, res) => {
      res.render('nombre-jugador', {
        logLevel: this.#logLevel,
        title: 'UNO Argentino - Nombre de Jugador',
        styles: ['/css/nombre-jugador.css'],
      });
    });

    this.app.get('/public/crear-sala', requireAuthWeb, (req, res) => {
      res.render('crear-sala', {
        logLevel: this.#logLevel,
        title: 'UNO Argentino - Crear Sala',
        styles: ['/css/crear-sala.css'],
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
        const apiBaseUrl = `${req.protocol}://${req.get('host')}`;

        registerLog(logger, 'debug', 'Payload a enviar al backend.', { payload });
        await axios.post(`${apiBaseUrl}/api/partidas`, payload, {
          headers: { 'Content-Type': 'application/json' },
        });

        res.redirect('/salas');
      } catch (error) {
        handleGenericErrorByEnv(error, next, res, 'Error al crear la sala.');
      }
    });

    this.app.get('/public/partida', requireAuthWeb, (req, res) => {
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const partidaId = req.query.partidaId;

      if (partidaId) {
        const acceso = this.#partidaController.obtenerPartida(partidaId, req.jugadorId);
        if (!acceso.ok) {
          return res.redirect(
            `/public/salas?error=${encodeURIComponent(acceso.error || 'No podés ingresar a esta partida.')}`
          );
        }
      }

      const sharePath = partidaId
        ? `/public/partida?partidaId=${encodeURIComponent(partidaId)}`
        : '/public/partida';

      res.render('partida', {
        logLevel: this.#logLevel,
        title: 'UNO Argentino - Partida',
        description: partidaId
          ? 'Unite a una partida de UNO Argentino y jugá online con tus amigos.'
          : 'Sala de partida de UNO Argentino para jugar online en tiempo real.',
        ogTitle: partidaId
          ? 'Te invitaron a una partida de UNO Argentino'
          : 'Partida de UNO Argentino',
        ogDescription: partidaId
          ? 'Entrá al link y sumate a la sala para jugar UNO online.'
          : 'Jugá una partida online de UNO Argentino en tiempo real.',
        seo: {
          canonicalUrl: `${baseUrl}${sharePath}`,
          ogImage: `${baseUrl}/images/uno-logo.png`,
          ogUrl: `${baseUrl}${sharePath}`,
        },
        styles: ['/css/partida.css'],
      });
    });

    this.app.get('/public/puntajes', async (req, res) => {
      const puntajes = this.#puntajesController
        ? await this.#puntajesController.listarPuntajes()
        : [];

      res.render('puntajes', {
        logLevel: this.#logLevel,
        title: 'UNO Argentino - Puntajes',
        styles: ['/css/puntajes.css'],
        puntajes,
        ...this.#buildSeoLocals(req, '/public/puntajes'),
      });
    });

    this.app.get('/public/salas', requireAuthWeb, (req, res) => {
      res.render('salas', {
        logLevel: this.#logLevel,
        title: 'UNO Argentino - Salas',
        styles: ['/css/salas.css'],
      });
    });

    this.app.get('/public/reglas', (req, res) => {
      res.render('reglas', {
        logLevel: this.#logLevel,
        embed: req.query.embed === '1',
        ...buildReglasLocals(req),
      });
    });
  }
}

module.exports = ManejadorFront;

const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const logger = require('#infraestructura/shared/logger');
const { logContext } = require('#infraestructura/shared/utils');

const NOMBRE_REGEX = /^[a-zA-Z0-9_\-áéíóúñüÁÉÍÓÚÑÜ]{3,50}$/;
const PASSWORD_MIN = 4;
const BCRYPT_ROUNDS = 10;

class AuthController {
  constructor(persistencia) {
    logContext(logger, this);
    this.persistencia = persistencia;
  }

  async registrar(nombreUsuario, password) {
    logContext(logger, this);

    const nombre = nombreUsuario?.trim();
    const clave = password?.trim();

    if (!nombre) return { ok: false, status: 400, error: 'El nombre de usuario es requerido' };

    // Verifica si el nombre tiene el formato correcto: se permiten letras acentuadas,
    // números, guiones y guiones bajos, entre 3 y 50 caracteres. Si no se cumple el formato
    // se devuelve error.
    if (!NOMBRE_REGEX.test(nombre))
      return {
        ok: false,
        status: 400,
        error: 'El nombre de usuario debe tener entre 3 y 50 caracteres (letras, números, _ o -)',
      };

    // Verifica la cantidad mínima de la contraseña.
    // Si no se cumple, se devuelve error.
    if (!clave || clave.length < PASSWORD_MIN)
      return {
        ok: false,
        status: 400,
        error: `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres`,
      };

    // Verifica que el usuario no exista previamente. Si existe, se devuelve error.
    if (await this.persistencia.obtenerJugadorPorNombre(nombre))
      return { ok: false, status: 409, error: 'El nombre de usuario ya está en uso' };

    // Asigna un ID único al jugador, hashea la contraseña, guarda el nuevo jugador en
    // la base de datos y lo marca como logueado.
    const jugadorId = uuidv4();
    const passwordHash = await bcrypt.hash(clave, BCRYPT_ROUNDS);
    await this.persistencia.registrarJugador(jugadorId, nombre, passwordHash);

    return { ok: true, data: { jugadorId, nombreUsuario: nombre } };
  }

  async ingresar(nombreUsuario, password) {
    logContext(logger, this);

    const nombre = nombreUsuario?.trim();
    const clave = password?.trim();

    if (!nombre) return { ok: false, status: 400, error: 'El nombre de usuario es requerido' };
    if (!clave) return { ok: false, status: 400, error: 'La contraseña es requerida' };

    const jugador = await this.persistencia.obtenerJugadorPorNombre(nombre);

    // Mismo mensaje para usuario no encontrado y contraseña incorrecta:
    // no revelamos si el nombre de usuario existe o no.
    const credencialesInvalidas = {
      ok: false,
      status: 401,
      error: 'Usuario o contraseña incorrectos',
    };

    if (!jugador) return credencialesInvalidas;

    const passwordOk = await bcrypt.compare(clave, jugador.passwordHash);
    if (!passwordOk) return credencialesInvalidas;

    return {
      ok: true,
      data: { jugadorId: jugador.jugadorId, nombreUsuario: jugador.nombreUsuario },
    };
  }

}

module.exports = AuthController;

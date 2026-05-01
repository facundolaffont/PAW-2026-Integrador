/**
 * Loguea en modo debug el nombre de la clase, el método y opcionalmente los parámetros.
 * @param {object} logger - Instancia de logger (winston).
 * @param {object} context - El objeto this de la clase (o null si no aplica).
 * @param {object} [params] - Objeto con los parámetros a loguear (clave: valor).
 */
function logContext(logger, context, params) {
  const stack = new Error().stack;
  const callerLine = stack.split('\n')[2];
  const methodMatch = callerLine.match(/at (\S+)/);
  const fullName = methodMatch ? methodMatch[1] : 'desconocido';

  let className = null;
  let methodName = fullName;
  if (fullName.includes('.')) {
    [className, methodName] = fullName.split('.');
  } else if (context && context.constructor && context.constructor.name) {
    className = context.constructor.name;
  }

  // Extraer archivo y línea
  let location = '';
  const locMatch =
    callerLine.match(/\((.*):(\d+):(\d+)\)/) || callerLine.match(/at (.*):(\d+):(\d+)/);
  if (locMatch) {
    if (locMatch.length === 4) {
      location = `${locMatch[1]}:${locMatch[2]}`;
    } else if (locMatch.length === 5) {
      location = `${locMatch[1]}:${locMatch[2]}`;
    }
  }

  const msg = `-> ${className ? `${className}.` : '-'}${methodName} (${location})`;
  if (params && Object.keys(params).length > 0) {
    registerLog(logger, 'debug', msg, params);
  } else {
    registerLog(logger, 'debug', msg);
  }
}

/**
 * Maneja el error según el entorno: llama a next(error) en desarrollo, o ejecuta
 * el callback en producción.
 *
 * Permite no tener que escribir condicionales de entorno en cada sección donde se
 * tengan que manejar errores, centralizando la lógica.
 *
 * @param {Error} error - El error a manejar.
 * @param {Function} next - Función a la cual pasarle el control en entorno de desarrollo.
 * @param {Function} callback - Función a ejecutar en producción.
 */
function handleErrorByEnv(error, next, callback) {
  if (isDevEnvConfigured()) {
    next(error);
  } else {
    callback(error);
  }
}

/**
 * Maneja un error genérico según el entorno: llama a next(error) en desarrollo, o envía
 * una respuesta con un mensaje genérico en producción.
 *
 * Permite simplificar el manejo de errores cuando no es relevante el manejo según el tipo
 * de excepción.
 *
 * @param {Error} error - El error a manejar.
 * @param {Function} next - Función a la cual pasarle el control en entorno de desarrollo.
 * @param {Object} res - Objeto de respuesta para enviar la respuesta en producción.
 * @param {string} defaultMessage - Mensaje genérico a enviar en producción.
 */
function handleGenericErrorByEnv(error, next, res, defaultMessage) {
  if (isDevEnvConfigured()) {
    next(error);
  } else {
    res.status(500).send(defaultMessage);
  }
}

/**
 * Determina si la aplicación está corriendo en un entorno de desarrollo o
 * si la variable de entorno NODE_ENV no está configurada.
 *
 * @returns {boolean} true si está en desarrollo o NODE_ENV no está configurada;
 * false en caso contrario.
 */
function isDevEnvConfigured() {
  return process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
}

/**
 * Determina si un valor es un objeto vacío ({}), null o undefined.
 * @param {any} obj - El valor a evaluar.
 * @returns {boolean} true si es un objeto vacío, null o undefined; false en caso contrario.
 */
function isEmptyObject(obj) {
  return (
    obj == null || (typeof obj === 'object' && !Array.isArray(obj) && Object.keys(obj).length === 0)
  );
}

/**
 * Registra un mensaje de log utilizando la instancia de logger proporcionada, el nivel
 * de log, el mensaje y los metadatos opcionales. El mensaje se formatea para incluir los
 * metadatos como JSON.
 *
 * @param {Object} loggerInstance - Instancia del logger a utilizar para registrar el
 * mensaje.
 * @param {string} level - Nivel de log (e.g., 'debug', 'info', 'error').
 * @param {string} message - Mensaje a registrar.
 * @param {Object} [meta={}] - Metadatos adicionales a incluir en el log.
 */
function registerLog(loggerInstance, level, message, meta = {}) {
  // Si meta está vacío, se registra el mensaje sin los metadatos.
  if (Object.keys(meta).length === 0) {
    loggerInstance[level](message);
    return;
  }

  // Si meta no está vacío, se incluye en el log formateado como JSON.
  loggerInstance[level](`${message} [${JSON.stringify(meta)}]`);
}

module.exports = {
  isDevEnvConfigured,
  isEmptyObject,
  handleErrorByEnv,
  handleGenericErrorByEnv,
  registerLog,
  logContext,
};

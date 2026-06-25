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

module.exports = {
  isDevEnvConfigured,
  isEmptyObject,
  handleErrorByEnv,
  handleGenericErrorByEnv,
};

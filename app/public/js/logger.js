/**
 * FrontLogger es una clase de logger para aplicaciones frontend que permite registrar mensajes de log
 * con diferentes niveles (debug, info, warn, error). El logger incluye información contextual sobre
 * el archivo y método desde donde se llamó el log, y permite configurar el nivel de log para filtrar
 * los mensajes registrados.
 *
 * El logger se puede configurar a través de una variable global `window.__APP_LOG_LEVEL__` o mediante
 * el método `setLevel()`. Los mensajes de log se registran en la consola del navegador con un formato
 * estructurado que incluye la marca de tiempo, el nombre del logger, el nivel de log, el mensaje y
 * cualquier información adicional proporcionada.
 */
class FrontLogger {
  /**
   * Niveles de log disponibles y su orden de prioridad.
   */
  #levels = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
  };

  #name; // Nombre del logger.
  #level; // Nivel de log actual (debug, info, warn, error).

  /**
   * Crea una nueva instancia del logger.
   *
   * @param {Object} options - Opciones de configuración.
   * @param {string} [options.name] - Nombre del logger.
   * @param {string} [options.level] - Nivel de log inicial.
   */
  constructor(options = {}) {
    this.#name = options.name || 'FrontLogger';
    this.#level = this.#normalizeLevel(options.level || window.__APP_LOG_LEVEL__ || 'debug');
  }

  /**
   * Establece el nivel de log.
   *
   * @param {string} level - Nivel de log a establecer.
   */
  setLevel(level) {
    this.#level = this.#normalizeLevel(level);
  }

  /**
   * Registra un mensaje de nivel debug.
   *
   * @param {string} message - Mensaje a registrar.
   * @param {Object} [meta] - Información adicional.
   */
  debug(message, meta = null) {
    this.#log('debug', message, meta);
  }

  /**
   * Registra un mensaje de nivel info.
   *
   * @param {string} message - Mensaje a registrar.
   * @param {Object} [meta] - Información adicional.
   */
  info(message, meta = null) {
    this.#log('info', message, meta);
  }

  /**
   * Registra un mensaje de nivel warn.
   *
   * @param {string} message - Mensaje a registrar.
   * @param {Object} [meta] - Información adicional.
   */
  warn(message, meta = null) {
    this.#log('warn', message, meta);
  }

  /**
   * Registra un mensaje de nivel error.
   *
   * @param {string} message - Mensaje a registrar.
   * @param {Object} [meta] - Información adicional.
   */
  error(message, meta = null) {
    this.#log('error', message, meta);
  }

  /**
   * Registra un mensaje en el log.
   *
   * @param {string} level - Nivel de log.
   * @param {string} message - Mensaje a registrar.
   * @param {Object} [meta] - Información adicional.
   * @returns {void}
   */
  #log(level, message, meta) {
    // No permite loggear si el nivel del mensaje es menor que el nivel configurado en el logger.
    if (!this.#shouldLog(level)) {
      return;
    }

    const timestamp = new Date().toISOString();
    const execution = this.#captureExecutionContext();
    const payload = {
      timestamp,
      execution,
    };

    // Agrega al payload el mensaje y la información adicional, solo si fueron proporcionados.
    if (message != null) {
      payload.message = message;
    }

    // Agrega al payload la información adicional, solo si es un objeto no vacío.
    if (meta != null && typeof meta === 'object' && Object.keys(meta).length > 0) {
      payload.meta = meta;
    }

    const prefix = `[${timestamp}] ${this.#name}.${level.toUpperCase()}`;
    const consoleMethod = level === 'debug' ? 'log' : level;

    if (payload.meta) {
      console[consoleMethod](prefix, payload.message || '', {
        execution: payload.execution,
        meta: payload.meta,
      });
      return;
    }

    console[consoleMethod](prefix, payload.message || '', {
      execution: payload.execution,
    });
  }

  /**
   * Determina si un mensaje debe ser registrado según el nivel de log.
   *
   * @param {string} level - Nivel de log del mensaje.
   * @returns {boolean} True si el mensaje debe ser registrado, false en caso contrario.
   */
  #shouldLog(level) {
    return this.#levels[level] >= this.#levels[this.#level];
  }

  /**
   * Normaliza el nivel de log.
   *
   * @param {string} level - Nivel de log a normalizar.
   * @returns {string} Nivel de log normalizado.
   */
  #normalizeLevel(level) {
    const candidate = String(level || '').toLowerCase();
    return this.#levels[candidate] ? candidate : 'debug';
  }

  /**
   * Captura el contexto de ejecución del log.
   *
   * @returns {Object} Objeto con información del archivo y método desde donde se llamó el log.
   */
  #captureExecutionContext() {
    const stack = new Error().stack || '';
    const callerLine = stack.split('\n')[3] || '';
    const methodMatch = callerLine.match(/at\s+([^\s]+)/);
    const locationMatch = callerLine.match(/(https?:\/\/[^)\s]+|\/[^:\s)]+):(\d+):(\d+)/);

    return {
      file: locationMatch ? `${locationMatch[1]}:${locationMatch[2]}` : 'desconocido',
      method: methodMatch ? methodMatch[1] : 'desconocido',
    };
  }
}

// Crea una instancia global del logger para uso en toda la aplicación.
export const frontLogger = new FrontLogger();

// Exporta la clase para que pueda ser utilizada en otros módulos y crear instancias.
export default FrontLogger;

const { createLogger, format, transports } = require('winston');

class Logger {
  constructor() {
    if (Logger._instance) {
      return Logger._instance;
    }

    this._logger = createLogger({
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
      format: format.combine(
        format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        format.printf(({ timestamp, level, _exec, _msg, _meta }) => {
          const indentJson = (obj) =>
            JSON.stringify(obj, null, 4)
              .split('\n')
              .map((line) => `    ${line}`)
              .join('\n');

          let output = `\n[${timestamp}] AppLogger.${level.toUpperCase()}:\n`;
          output += `\n    Contexto de ejecución:\n${indentJson(_exec)}\n`;

          if (_msg != null) {
            output += `\n    Mensaje:\n    ${_msg}\n`;
          }

          if (_meta != null && Object.keys(_meta).length > 0) {
            output += `\n    Contexto de mensaje:\n${indentJson(_meta)}\n`;
          }

          return output;
        })
      ),
      transports: [
        new transports.File({ filename: 'logs/error.log', level: 'error' }),
        new transports.File({ filename: 'logs/app.log' }),
      ],
    });

    Logger._instance = this;
  }

  /**
   * Registra una entrada de log con contexto de ejecución pre-computado.
   * @param {string} level - Nivel de log ('info', 'warn', 'error', 'debug').
   * @param {{ file: string, method: string }} executionContext - Contexto de ejecución.
   * @param {string|null} [message=null] - Mensaje opcional.
   * @param {object|null} [meta=null] - Metadatos opcionales del mensaje.
   */
  logEntry(level, executionContext, message = null, meta = null) {
    this._logger[level]('', {
      _exec: executionContext,
      _msg: message,
      _meta: meta,
    });
  }

  info(message, meta = {}) {
    this.logEntry(
      'info',
      this._captureExecutionContext(4),
      message || null,
      Object.keys(meta).length ? meta : null
    );
  }
  warn(message, meta = {}) {
    this.logEntry(
      'warn',
      this._captureExecutionContext(4),
      message || null,
      Object.keys(meta).length ? meta : null
    );
  }
  error(message, meta = {}) {
    this.logEntry(
      'error',
      this._captureExecutionContext(4),
      message || null,
      Object.keys(meta).length ? meta : null
    );
  }
  debug(message, meta = {}) {
    this.logEntry(
      'debug',
      this._captureExecutionContext(4),
      message || null,
      Object.keys(meta).length ? meta : null
    );
  }

  /**
   * Loguea en modo debug el método caller y opcionalmente los parámetros.
   * @param {object} context - El objeto this de la clase (o la clase en métodos estáticos).
   * @param {object} [params] - Metadatos opcionales del mensaje.
   */
  logContext(context, params) {
    const meta = params && Object.keys(params).length > 0 ? params : null;
    this.logEntry('debug', this._captureExecutionContext(3), null, meta);
  }

  /**
   * Registra un mensaje con nivel dinámico y contexto de ejecución del caller.
   * @param {string} level - Nivel de log ('debug', 'info', 'warn', 'error').
   * @param {string} message - Mensaje a registrar.
   * @param {object} [meta={}] - Metadatos adicionales.
   */
  registerLog(level, message, meta = {}) {
    this.logEntry(
      level,
      this._captureExecutionContext(3),
      message || null,
      Object.keys(meta).length > 0 ? meta : null
    );
  }

  _captureExecutionContext(frameIndex) {
    const stack = new Error().stack;
    const callerLine = stack.split('\n')[frameIndex] || '';
    const methodMatch = callerLine.match(/at (\S+)/);
    const locMatch =
      callerLine.match(/\((.*):(\d+):(\d+)\)/) || callerLine.match(/at (.*):(\d+):(\d+)/);
    return {
      file: locMatch ? `${locMatch[1]}:${locMatch[2]}` : 'desconocido',
      method: methodMatch ? methodMatch[1] : 'desconocido',
    };
  }
}

module.exports = new Logger();

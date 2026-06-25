const AppException = require('#errores/AppException');
const logger = require('#infraestructura/shared/logger');
const { logContext } = require('#infraestructura/shared/utils');

class EmptyException extends AppException {
  constructor(message) {
    logContext(logger, this);
    super(message);
  }
}

module.exports = EmptyException;

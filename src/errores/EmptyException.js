const AppException = require('#errores/AppException');
const logger = require('#infraestructura/shared/logger');
class EmptyException extends AppException {
  constructor(message) {
    logger.logContext(this);
    super(message);
  }
}

module.exports = EmptyException;

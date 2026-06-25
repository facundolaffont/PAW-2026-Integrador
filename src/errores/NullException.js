const AppException = require('#errores/AppException');
const logger = require('#infraestructura/shared/logger');
class NullException extends AppException {
  constructor(message) {
    logger.logContext(this);
    super(message);
    this.name = 'NullException';
  }
}

module.exports = NullException;

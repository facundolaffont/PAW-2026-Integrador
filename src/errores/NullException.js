const AppException = require('#errores/AppException');
const logger = require('#infraestructura/shared/logger');
const { logContext } = require('#infraestructura/shared/utils');
class NullException extends AppException {
  constructor(message) {
    logContext(logger, this);
    super(message);
    this.name = 'NullException';
  }
}

module.exports = NullException;

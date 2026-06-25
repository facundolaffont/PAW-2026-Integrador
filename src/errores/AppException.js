const logger = require('#infraestructura/shared/logger');
class AppException extends Error {
  constructor(message) {
    logger.logContext(this);
    super(message);
    this.name = this.constructor.name;
  }
}

module.exports = AppException;

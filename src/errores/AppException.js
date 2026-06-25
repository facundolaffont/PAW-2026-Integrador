const logger = require('#infraestructura/shared/logger');
const { logContext } = require('#infraestructura/shared/utils');

class AppException extends Error {
  constructor(message) {
    logContext(logger, this);
    super(message);
    this.name = this.constructor.name;
  }
}

module.exports = AppException;

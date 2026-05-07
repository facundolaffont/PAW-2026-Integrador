const logger = require('../logger');
const { logContext } = require('../utils');

class AppException extends Error {
  constructor(message) {
    logContext(logger, this);
    super(message);
    this.name = this.constructor.name;
  }
}

module.exports = AppException;

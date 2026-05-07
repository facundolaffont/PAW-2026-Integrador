const AppException = require('./AppException');
const logger = require('../logger');
const { logContext } = require('../utils');

class EmptyException extends AppException {
  constructor(message) {
    logContext(logger, this);
    super(message);
  }
}

module.exports = EmptyException;

const AppException = require('./AppException');
const logger = require('../logger');
const { logContext } = require('../utils');
class NullException extends AppException {
  constructor(message) {
    logContext(logger, this);
    super(message);
    this.name = 'NullException';
  }
}

module.exports = NullException;

const AppException = require('./AppException');

class EmptyException extends AppException {
  constructor(message) {
    super(message);
  }
}

module.exports = EmptyException;

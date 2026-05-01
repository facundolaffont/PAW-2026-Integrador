const AppException = require('./AppException');
class NullException extends AppException {
  constructor(message) {
    super(message);
    this.name = 'NullException';
  }
}

module.exports = NullException;

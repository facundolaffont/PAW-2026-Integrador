const Carta = require('#dominio/Carta');
const logger = require('#infraestructura/shared/logger');
class Mazo {
  constructor(cartas = []) {
    logger.logContext(this);
    this.cartas = [...cartas];
  }

  static crearCompleto() {
    logger.logContext(Mazo);
    const cartas = [];

    for (const color of Carta.COLORES) {
      cartas.push(new Carta(color, 'numero', 0));

      for (let n = 1; n <= 9; n++) {
        cartas.push(new Carta(color, 'numero', n));
        cartas.push(new Carta(color, 'numero', n));
      }

      for (const tipo of Carta.ESPECIALES) {
        cartas.push(new Carta(color, tipo));
        cartas.push(new Carta(color, tipo));
      }
    }

    for (let i = 0; i < 4; i++) {
      cartas.push(new Carta(null, 'comodin'));
      cartas.push(new Carta(null, 'roba-cuatro'));
    }

    const mazo = new Mazo(cartas);
    mazo.mezclar();
    return mazo;
  }

  mezclar() {
    logger.logContext(this);
    for (let i = this.cartas.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cartas[i], this.cartas[j]] = [this.cartas[j], this.cartas[i]];
    }
  }

  robar(cantidad = 1) {
    logger.logContext(this);
    return this.cartas.splice(0, cantidad);
  }

  agregar(carta) {
    logger.logContext(this);
    this.cartas.push(carta);
  }

  get cantidad() {
    logger.logContext(this);
    return this.cartas.length;
  }

  get estaVacio() {
    logger.logContext(this);
    return this.cartas.length === 0;
  }
}

module.exports = Mazo;

const { v4: uuidv4 } = require('uuid');
const logger = require('#infraestructura/shared/logger');
class Carta {
  static COLORES = ['rojo', 'amarillo', 'verde', 'azul'];
  static ESPECIALES = ['roba-dos', 'reversa', 'salta'];
  static TIPOS_ACUMULABLES = new Set(['roba-dos', 'roba-cuatro']);

  constructor(color, tipo, numero = null) {
    logger.logContext(this);
    this.id = uuidv4();
    this.color = color;
    this.tipo = tipo;
    this.numero = numero;
    this.colorElegido = null;
  }

  get valor() {
    logger.logContext(this);
    if (this.tipo === 'numero') return this.numero;
    if (Carta.ESPECIALES.includes(this.tipo)) return 20;
    return 50;
  }

  get esComodin() {
    logger.logContext(this);
    return this.color === null;
  }

  get esAcumulable() {
    logger.logContext(this);
    return Carta.TIPOS_ACUMULABLES.has(this.tipo);
  }

  // Determina si `carta` puede jugarse sobre `enMesa`.
  //
  // Regla de penalidad (roba-dos/tres/cuatro acumulados):
  //   Cuando hay penalidad activa solo se puede jugar una carta del mismo tipo
  //   acumulable — ya sea comodín o no. Cualquier otra carta es inválida.
  //
  // Comodines sin penalidad:
  //   Se pueden jugar sobre cualquier carta; el color lo elige el jugador después.
  //
  // Cartas normales sin penalidad:
  //   Válidas si comparten color, o tipo (solo en cartas no numéricas),
  //   o mismo número entre cartas numéricas.
  //   Para comodines en mesa se usa `colorElegido` en lugar de `color` (que es null).
  static esJugadaValida(carta, enMesa, penalidad, tipoPenalidad) {
    logger.logContext(Carta);
    if (carta.esComodin) {
      if (penalidad > 0) return carta.esAcumulable && carta.tipo === tipoPenalidad;

      return true;
    }

    if (penalidad > 0) {
      return carta.esAcumulable && carta.tipo === tipoPenalidad;
    }

    const colorMesa = enMesa.colorElegido || enMesa.color;
    const mismoTipoNoNumerico =
      carta.tipo !== 'numero' && enMesa.tipo !== 'numero' && carta.tipo === enMesa.tipo;

    return (
      carta.color === colorMesa ||
      mismoTipoNoNumerico ||
      (carta.tipo === 'numero' && enMesa.tipo === 'numero' && carta.numero === enMesa.numero)
    );
  }
}

module.exports = Carta;

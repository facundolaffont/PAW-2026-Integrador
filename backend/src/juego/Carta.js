const { v4: uuidv4 } = require('uuid');

class Carta {
  static COLORES = ['rojo', 'amarillo', 'verde', 'azul'];
  static ESPECIALES = ['roba-dos', 'reversa', 'salta'];
  static TIPOS_ACUMULABLES = new Set(['roba-dos', 'roba-tres', 'roba-cuatro']);

  constructor(color, tipo, numero = null) {
    this.id = uuidv4();
    this.color = color;
    this.tipo = tipo;
    this.numero = numero;
    this.colorElegido = null;
  }

  get valor() {
    if (this.tipo === 'numero') return this.numero;
    if (Carta.ESPECIALES.includes(this.tipo)) return 20;
    return 50;
  }

  get esComodin() {
    return this.color === null;
  }

  get esAcumulable() {
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
  //   Válidas si comparten color, tipo, o —solo entre números— mismo número.
  //   Para comodines en mesa se usa `colorElegido` en lugar de `color` (que es null).
  static esJugadaValida(carta, enMesa, penalidad, tipoPenalidad) {
    if (carta.esComodin) {
      if (penalidad > 0) return carta.esAcumulable && carta.tipo === tipoPenalidad;

      return true;
    }

    if (penalidad > 0) {
      return carta.esAcumulable && carta.tipo === tipoPenalidad;
    }

    const colorMesa = enMesa.colorElegido || enMesa.color;

    return (
      carta.color === colorMesa ||
      carta.tipo === enMesa.tipo ||
      (carta.tipo === 'numero' && enMesa.tipo === 'numero' && carta.numero === enMesa.numero)
    );
  }
}

module.exports = Carta;

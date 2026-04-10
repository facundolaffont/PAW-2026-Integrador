const { v4: uuidv4 } = require('uuid');

const COLORES = ['rojo', 'amarillo', 'verde', 'azul'];
const ESPECIALES = ['roba-dos', 'reversa', 'salta'];

function valorCarta(carta) {
  if (carta.tipo === 'numero') return carta.numero;

  if (ESPECIALES.includes(carta.tipo)) return 20;

  return 50;
}

function crearMazo() {
  const cartas = [];

  for (const color of COLORES) {
    // 0 (una sola)
    cartas.push({ id: uuidv4(), color, tipo: 'numero', numero: 0 });

    // 1-9 (dos de cada uno)
    for (let n = 1; n <= 9; n++) {
      cartas.push({ id: uuidv4(), color, tipo: 'numero', numero: n });

      cartas.push({ id: uuidv4(), color, tipo: 'numero', numero: n });
    }

    // Especiales x2
    for (const tipo of ESPECIALES) {
      cartas.push({ id: uuidv4(), color, tipo });

      cartas.push({ id: uuidv4(), color, tipo });
    }
  }

  // Comodines x4
  for (let i = 0; i < 4; i++) {
    cartas.push({ id: uuidv4(), color: null, tipo: 'comodin' });

    cartas.push({ id: uuidv4(), color: null, tipo: 'roba-cuatro' });

    cartas.push({ id: uuidv4(), color: null, tipo: 'roba-tres' });
  }

  return mezclar(cartas);
}

function mezclar(cartas) {
  const arr = [...cartas];

  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));

    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  return arr;
}

module.exports = { crearMazo, valorCarta, mezclar };

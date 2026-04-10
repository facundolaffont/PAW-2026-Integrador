const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const model = genAI.getGenerativeModel({
  model: 'gemini-1.5-flash',
  generationConfig: { responseMimeType: 'application/json' },
});

/**
 * Dado el estado del juego desde la perspectiva del bot,
 * devuelve { cartaId } o { robar: true }.
 */
async function decidirJugada(mano, cartaEnMesa, penalidad, tipoPenalidad, nombresBotRivales) {
  const cartasValidas = mano.filter((c) => esCartaValida(c, cartaEnMesa, penalidad, tipoPenalidad));

  // Si no hay carta válida, robar directamente sin llamar a la API
  if (cartasValidas.length === 0) return { robar: true };

  const prompt = armarPrompt(
    mano,
    cartasValidas,
    cartaEnMesa,
    penalidad,
    tipoPenalidad,
    nombresBotRivales
  );

  try {
    const resultado = await model.generateContent(prompt);

    const texto = resultado.response.text();

    const json = JSON.parse(texto);

    // Validar que la carta elegida existe y es válida
    if (json.cartaId && cartasValidas.find((c) => c.id === json.cartaId)) {
      return { cartaId: json.cartaId, colorElegido: json.colorElegido || null };
    }

    if (json.robar) return { robar: true };

    // Fallback: carta válida aleatoria
    return fallback(cartasValidas);
  } catch {
    return fallback(cartasValidas);
  }
}

function armarPrompt(mano, cartasValidas, cartaEnMesa, penalidad, tipoPenalidad, rivales) {
  const describir = (c) =>
    c.color
      ? `${c.color}-${c.tipo === 'numero' ? c.numero : c.tipo} (id: ${c.id})`
      : `${c.tipo} (id: ${c.id})`;

  const cartaMesaDesc = cartaEnMesa.colorElegido
    ? `${cartaEnMesa.colorElegido}-${cartaEnMesa.tipo}`
    : describir(cartaEnMesa);

  return `
    Estás jugando UNO Argentino. Sos el bot.

    Carta en mesa: ${cartaMesaDesc}
    Penalidad acumulada: ${penalidad} cartas (tipo: ${tipoPenalidad || 'ninguna'})
    Rivales y sus cartas: ${rivales.map((r) => `${r.nombre}: ${r.cantidadCartas} cartas`).join(', ')}

    Tu mano completa:
    ${mano.map(describir).join('\n')}

    Cartas que podés jugar ahora:
    ${cartasValidas.map(describir).join('\n')}

    Elegí la mejor jugada. Si elegís un comodín, también indicá el color (rojo, azul, verde, amarillo).

    Respondé SOLO con este JSON:
    { "cartaId": "<id de la carta>", "colorElegido": "<color o null>" }

    O si preferís robar:
    { "robar": true }
    `.trim();
}

function esCartaValida(carta, enMesa, penalidad, tipoPenalidad) {
  if (carta.color === null) {
    if (penalidad > 0) return carta.tipo === tipoPenalidad;

    return true;
  }

  if (penalidad > 0) return carta.tipo === tipoPenalidad;

  const colorMesa = enMesa.colorElegido || enMesa.color;

  return (
    carta.color === colorMesa ||
    carta.tipo === enMesa.tipo ||
    (carta.tipo === 'numero' && enMesa.tipo === 'numero' && carta.numero === enMesa.numero)
  );
}

function fallback(cartasValidas) {
  // Preferir cartas de acción sobre números
  const accion = cartasValidas.find((c) => c.tipo !== 'numero');

  const elegida = accion || cartasValidas[Math.floor(Math.random() * cartasValidas.length)];

  const colorElegido =
    elegida.color === null
      ? ['rojo', 'azul', 'verde', 'amarillo'][Math.floor(Math.random() * 4)]
      : null;

  return { cartaId: elegida.id, colorElegido };
}

module.exports = { decidirJugada };

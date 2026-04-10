const { GoogleGenerativeAI } = require('@google/generative-ai');
const Carta = require('./Carta');

class BotLLM {
  constructor() {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    this.model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: { responseMimeType: 'application/json' },
    });
  }

  async decidirJugada(mano, cartaEnMesa, penalidad, tipoPenalidad, rivales) {
    const cartasValidas = mano.filter((c) =>
      Carta.esJugadaValida(c, cartaEnMesa, penalidad, tipoPenalidad),
    );

    if (cartasValidas.length === 0) return { robar: true };

    const prompt = this._armarPrompt(mano, cartasValidas, cartaEnMesa, penalidad, tipoPenalidad, rivales);

    try {
      const resultado = await this.model.generateContent(prompt);
      const texto = resultado.response.text();
      const json = JSON.parse(texto);

      if (json.cartaId && cartasValidas.find((c) => c.id === json.cartaId)) {
        return { cartaId: json.cartaId, colorElegido: json.colorElegido || null };
      }

      if (json.robar) return { robar: true };

      return this._fallback(cartasValidas);
    } catch {
      return this._fallback(cartasValidas);
    }
  }

  _armarPrompt(mano, cartasValidas, cartaEnMesa, penalidad, tipoPenalidad, rivales) {
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

  _fallback(cartasValidas) {
    const accion = cartasValidas.find((c) => c.tipo !== 'numero');
    const elegida = accion || cartasValidas[Math.floor(Math.random() * cartasValidas.length)];
    const colorElegido =
      elegida.color === null
        ? ['rojo', 'azul', 'verde', 'amarillo'][Math.floor(Math.random() * 4)]
        : null;
    return { cartaId: elegida.id, colorElegido };
  }
}

module.exports = BotLLM;

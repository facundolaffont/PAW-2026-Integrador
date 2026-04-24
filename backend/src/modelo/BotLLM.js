const { GoogleGenerativeAI } = require('@google/generative-ai');
const Carta = require('./Carta');

const REGLAS_UNO = `
REGLAS DEL UNO ARGENTINO:

- Jugada válida: podés jugar una carta si coincide en COLOR o TIPO con la carta en mesa, o si es un comodín.
- Comodines (comodin, roba-tres, roba-cuatro): se juegan sobre cualquier carta. Debés elegir el nuevo color (rojo, azul, verde, amarillo).
- Roba Dos (+2): el siguiente jugador roba 2 cartas y pierde el turno. Se pueden apilar: si el siguiente tiene otro +2, puede jugarlo y acumular la penalidad.
- Roba Tres (+3): igual que +2 pero acumula 3. Solo se apila con otro +3.
- Roba Cuatro (+4): igual que +2 pero acumula 4. Solo se apila con otro +4.
- Penalidad acumulada: cuando hay penalidad activa, SOLO podés jugar una carta del mismo tipo de penalidad para apilar, o robar todas las cartas acumuladas.
- Salta: el siguiente jugador pierde su turno.
- Reversa: invierte el sentido del juego. Con 2 jugadores, actúa como Salta.
- Fin de ronda: el primero en quedarse sin cartas gana la ronda y suma los puntos de las cartas restantes de los rivales.
- Valores: números = valor nominal, especiales (salta/reversa/roba-dos) = 20 pts, comodines = 50 pts.
- Fin de partida: el primero en llegar a 500 puntos gana.

ESTRATEGIA RECOMENDADA:
- Priorizá jugar cartas de alto valor (comodines y especiales) para no quedarte con muchos puntos si otro gana.
- Si un rival tiene pocas cartas, jugá cartas de acción (+2, salta, reversa) para frenarlo.
- Guardá los comodines para situaciones donde no tengas otra opción o para cambiar a un color que te convenga.
- Elegí el color del que tengas más cartas al jugar un comodín.
`.trim();

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
${REGLAS_UNO}

ESTADO ACTUAL:
- Carta en mesa: ${cartaMesaDesc}
- Penalidad acumulada: ${penalidad} cartas (tipo: ${tipoPenalidad || 'ninguna'})
- Rivales: ${rivales.map((r) => `${r.nombre}: ${r.cantidadCartas} cartas`).join(', ')}

Tu mano completa:
${mano.map(describir).join('\n')}

Cartas que podés jugar ahora:
${cartasValidas.map(describir).join('\n')}

Elegí la mejor jugada. Si elegís un comodín, indicá el color (rojo, azul, verde, amarillo).

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

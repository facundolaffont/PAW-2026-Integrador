const { GoogleGenerativeAI } = require('@google/generative-ai');
const Carta = require('#dominio/Carta');
const logger = require('#infraestructura/shared/logger');
const REGLAS_UNO = `
REGLAS DEL UNO ARGENTINO:

- Jugada válida: podés jugar una carta si coincide en COLOR o TIPO con la carta en mesa, o si es un comodín.
- Comodines (comodin, roba-cuatro): se juegan sobre cualquier carta. Debés elegir el nuevo color (rojo, azul, verde, amarillo).
- Roba Dos (+2): el siguiente jugador roba 2 cartas y pierde el turno. Se pueden apilar: si el siguiente tiene otro +2, puede jugarlo y acumular la penalidad.
- Roba Cuatro (+4): igual que +2 pero acumula 4. Solo se apila con otro +4.
- Penalidad acumulada: cuando hay penalidad activa, SOLO podés jugar una carta del mismo tipo de penalidad (+2 o +4) para apilar, o robar todas las cartas acumuladas.
- Salta: el siguiente jugador pierde su turno.
- Reversa: invierte el sentido del juego. Con 2 jugadores, actúa como Salta.
- Fin de ronda: el primero en quedarse sin cartas gana la ronda y suma los puntos de las cartas restantes de los rivales.
- Valores: números = valor nominal, especiales (salta/reversa/roba-dos) = 20 pts, comodines = 50 pts.
- Fin de partida: el primero en llegar a 200 puntos gana.

ESTRATEGIA RECOMENDADA:
- Priorizá jugar cartas de alto valor (comodines y especiales) para no quedarte con muchos puntos si otro gana.
- Si un rival tiene pocas cartas, jugá cartas de acción (+2, salta, reversa) para frenarlo.
- Guardá los comodines para situaciones donde no tengas otra opción o para cambiar a un color que te convenga.
- Elegí el color del que tengas más cartas al jugar un comodín.
`.trim();

// Bot que usa Gemini 1.5 Flash para decidir jugadas. Recibe el estado del turno,
// construye un prompt con las reglas y el contexto, y parsea la respuesta JSON del modelo.
// Si la API falla o devuelve una jugada inválida, cae al modo _fallback.
class BotLLM {
  constructor() {
    logger.logContext(this);
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    this.model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: { responseMimeType: 'application/json' },
    });
  }

  async decidirJugada(mano, cartaEnMesa, penalidad, tipoPenalidad, rivales) {
    logger.logContext(this);
    const cartasValidas = mano.filter((c) =>
      Carta.esJugadaValida(c, cartaEnMesa, penalidad, tipoPenalidad)
    );

    // Sin jugadas posibles, el bot debe robar obligatoriamente
    if (cartasValidas.length === 0) return { robar: true };

    const prompt = this._armarPrompt(
      mano,
      cartasValidas,
      cartaEnMesa,
      penalidad,
      tipoPenalidad,
      rivales
    );

    try {
      const resultado = await this.model.generateContent(prompt);

      const texto = resultado.response.text();

      const json = JSON.parse(texto);

      // Validar que la carta elegida por el modelo sea realmente una carta válida de la mano
      if (json.cartaId && cartasValidas.find((c) => c.id === json.cartaId)) {
        return { cartaId: json.cartaId, colorElegido: json.colorElegido || null };
      }

      if (json.robar) return { robar: true };

      // El modelo devolvió un JSON bien formado pero con una carta inválida
      return this._fallback(cartasValidas);
    } catch {
      // Error de red, timeout, o JSON malformado
      return this._fallback(cartasValidas);
    }
  }

  // Convierte una carta a texto legible para el prompt.
  // Cartas con color: "<color>-<tipo|numero>" — Comodines (sin color): "<tipo>"
  // Si la carta en mesa es un comodín ya jugado, usa el colorElegido en lugar del color original.
  _armarPrompt(mano, cartasValidas, cartaEnMesa, penalidad, tipoPenalidad, rivales) {
    logger.logContext(this);
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

  // Estrategia de emergencia cuando el modelo no responde o devuelve una jugada inválida.
  // Reglas: prioriza cartas de acción (no numéricas) sobre números.
  // Si la elegida es comodín (sin color), elige un color al azar.
  _fallback(cartasValidas) {
    logger.logContext(this);
    const COLORES = ['rojo', 'azul', 'verde', 'amarillo'];
    const aleatorio = (arr) => arr[Math.floor(Math.random() * arr.length)];

    // Busca una carta de accion (salta, reversa, roba-dos, comodines) y si no encuentra ninguna
    // elige una carta numerica random.
    const elegida = cartasValidas.find((c) => c.tipo !== 'numero') ?? aleatorio(cartasValidas);

    // Si la carta elegida es un comodín sin color, elige un color al azar.
    // Si ya tiene color (no es comodín), no elige color.
    const colorElegido = elegida.color === null ? aleatorio(COLORES) : null;

    return { cartaId: elegida.id, colorElegido };
  }
}

module.exports = BotLLM;

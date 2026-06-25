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

/**
 * Bot que decide jugadas usando Gemini 1.5 Flash. Construye un prompt con las reglas del juego
 * y el estado del turno, parsea la respuesta JSON del modelo y valida la carta elegida.
 * Si la API falla o devuelve una jugada inválida, aplica una estrategia heurística de fallback.
 */
class BotLLM {
  /**
   * Inicializa el cliente de Google Generative AI con `GEMINI_API_KEY` y el modelo
   * `gemini-1.5-flash` configurado para responder en JSON.
   */
  constructor() {
    logger.logContext(this);
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    this.model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: { responseMimeType: 'application/json' },
    });
  }

  /**
   * Decide la jugada del bot para el turno actual.
   *
   * Filtra las cartas válidas, consulta al modelo y valida la respuesta. Ante error de API,
   * JSON malformado o carta inválida, delega en `#fallback`.
   *
   * @param {import('#dominio/Carta')[]} mano - Cartas en mano del bot.
   * @param {import('#dominio/Carta')} cartaEnMesa - Carta visible en el descarte.
   * @param {number} penalidad - Cantidad de cartas acumuladas en penalidad activa.
   * @param {string|null} tipoPenalidad - Tipo de penalidad activa (`roba-dos`, `roba-cuatro`) o null.
   * @param {{ nombre: string, cantidadCartas: number }[]} rivales - Estado de los rivales.
   * @returns {Promise<{ robar: true } | { cartaId: string, colorElegido: string|null }>}
   */
  async decidirJugada(mano, cartaEnMesa, penalidad, tipoPenalidad, rivales) {
    logger.logContext(this);
    const cartasValidas = mano.filter((c) =>
      Carta.esJugadaValida(c, cartaEnMesa, penalidad, tipoPenalidad)
    );

    if (cartasValidas.length === 0) return { robar: true };

    const prompt = this.#armarPrompt(
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

      return this.#fallback(cartasValidas);
    } catch {
      return this.#fallback(cartasValidas);
    }
  }

  /**
   * Construye el prompt para el modelo con reglas, estado de mesa, mano y cartas jugables.
   *
   * @param {import('#dominio/Carta')[]} mano - Cartas en mano del bot.
   * @param {import('#dominio/Carta')[]} cartasValidas - Cartas que el bot puede jugar ahora.
   * @param {import('#dominio/Carta')} cartaEnMesa - Carta visible en el descarte.
   * @param {number} penalidad - Cantidad de cartas acumuladas en penalidad activa.
   * @param {string|null} tipoPenalidad - Tipo de penalidad activa o null.
   * @param {{ nombre: string, cantidadCartas: number }[]} rivales - Estado de los rivales.
   * @returns {string} Prompt listo para enviar al modelo.
   * @private
   */
  #armarPrompt(mano, cartasValidas, cartaEnMesa, penalidad, tipoPenalidad, rivales) {
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

  /**
   * Estrategia de emergencia cuando el modelo no responde o devuelve una jugada inválida.
   * Prioriza cartas de acción sobre números; si la elegida es comodín, elige un color al azar.
   *
   * @param {import('#dominio/Carta')[]} cartasValidas - Cartas que el bot puede jugar ahora.
   * @returns {{ cartaId: string, colorElegido: string|null }}
   * @private
   */
  #fallback(cartasValidas) {
    logger.logContext(this);
    const COLORES = ['rojo', 'azul', 'verde', 'amarillo'];
    const aleatorio = (arr) => arr[Math.floor(Math.random() * arr.length)];

    const elegida = cartasValidas.find((c) => c.tipo !== 'numero') ?? aleatorio(cartasValidas);

    const colorElegido = elegida.color === null ? aleatorio(COLORES) : null;

    return { cartaId: elegida.id, colorElegido };
  }
}

module.exports = BotLLM;

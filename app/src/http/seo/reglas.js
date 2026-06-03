/**
 * Metadatos SEO + structured data (Schema.org HowTo) para la página
 * pública del reglamento. Se separa del manejador de rutas para que
 * el handler quede limpio y la data sea fácil de mantener/editar.
 */

const DESCRIPTION =
  'Reglamento oficial de UNO Argentino: composición del mazo (108 cartas), objetivo, ' +
  'turnos, reparto, acciones, reglas por carta y sistema de puntaje. Aprendé a jugar UNO.';

const KEYWORDS = [
  'UNO',
  'UNO Argentino',
  'reglas',
  'reglamento',
  'juego de cartas',
  'cómo jugar UNO',
  'comodín',
  'roba dos',
  'roba cuatro',
  'cambio de sentido',
].join(', ');

const HOW_TO_STEPS = [
  {
    name: 'Reparto inicial',
    text:
      'Se baraja el mazo y se reparten 7 cartas boca abajo a cada jugador en sentido horario. ' +
      'Se deja el resto del mazo boca abajo en el centro y se voltea la primera carta para ' +
      'iniciar el descarte.',
  },
  {
    name: 'Jugar una carta',
    text:
      'En tu turno jugá una carta que coincida en color o número con la última del descarte, ' +
      'o cualquier comodín. Si no podés, robá una carta del mazo.',
  },
  {
    name: 'Cantar UNO',
    text:
      'Decí "UNO" antes de jugar tu penúltima carta. Si no lo decís y otro jugador te ' +
      'denuncia, robás 2 cartas.',
  },
  {
    name: 'Cerrar la ronda',
    text:
      'Al jugar tu última carta finaliza la ronda. Sumás los puntos de las cartas que les ' +
      'quedaron a los oponentes.',
  },
  {
    name: 'Ganar la partida',
    text: 'El primer jugador en llegar a 500 puntos acumulados gana la partida.',
  },
];

/**
 * Construye las locals que necesita `reglas.ejs` a partir de la request,
 * para resolver bien `canonical` y `ogImage` con el host real.
 *
 * @param {import('express').Request} req
 * @returns {object} locals para res.render
 */
function buildReglasLocals(req) {
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const canonical = `${baseUrl}/public/reglas`;
  const ogImage = `${baseUrl}/images/uno-logo.png`;

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: 'Cómo jugar a UNO Argentino',
    description: DESCRIPTION,
    image: ogImage,
    totalTime: 'PT20M',
    inLanguage: 'es-AR',
    supply: [{ '@type': 'HowToSupply', name: 'Mazo de UNO Argentino (108 cartas)' }],
    step: HOW_TO_STEPS.map((s) => ({ '@type': 'HowToStep', name: s.name, text: s.text })),
  });

  return {
    title: 'Reglas de UNO Argentino — Reglamento completo del juego',
    description: DESCRIPTION,
    keywords: KEYWORDS,
    canonicalUrl: canonical,
    ogImage,
    ogType: 'article',
    jsonLd,
    styles: ['/styles/reglas.css'],
  };
}

module.exports = { buildReglasLocals };

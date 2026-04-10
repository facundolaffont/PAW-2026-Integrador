// Almacenamiento en memoria
const jugadores = new Map(); // jugadorId -> { jugadorId, nombreUsuario, puntajeGlobal }
const partidas = new Map(); // partidaId  -> SalaDeJuego

function registrarJugador(jugadorId, nombreUsuario) {
  jugadores.set(jugadorId, { jugadorId, nombreUsuario, puntajeGlobal: 0 });
}

function obtenerJugador(jugadorId) {
  return jugadores.get(jugadorId) || null;
}

function obtenerJugadorPorNombre(nombreUsuario) {
  for (const j of jugadores.values()) {
    if (j.nombreUsuario === nombreUsuario) return j;
  }

  return null;
}

function ajustarPuntajeGlobal(jugadorId, delta) {
  const j = jugadores.get(jugadorId);

  if (!j) return;

  j.puntajeGlobal = Math.max(0, j.puntajeGlobal + delta);
}

function obtenerPuntajes() {
  return [...jugadores.values()]
    .sort((a, b) => b.puntajeGlobal - a.puntajeGlobal)
    .map(({ nombreUsuario, puntajeGlobal }) => ({ nombreUsuario, puntajeGlobal }));
}

function guardarPartida(partidaId, sala) {
  partidas.set(partidaId, sala);
}

function obtenerPartida(partidaId) {
  return partidas.get(partidaId) || null;
}

function eliminarPartida(partidaId) {
  partidas.delete(partidaId);
}

function listarPartidasDisponibles() {
  return [...partidas.values()]
    .filter((s) => s.estado === 'esperando')
    .map((s) => s.resumenPublico());
}

module.exports = {
  registrarJugador,
  obtenerJugador,
  obtenerJugadorPorNombre,
  ajustarPuntajeGlobal,
  obtenerPuntajes,
  guardarPartida,
  obtenerPartida,
  eliminarPartida,
  listarPartidasDisponibles,
};

class ManejadorConexiones {
  constructor() {
    this.conexiones = new Map();
  }

  registrar(jugadorId, ws) {
    this.conexiones.set(jugadorId, ws);
  }

  desregistrar(jugadorId) {
    this.conexiones.delete(jugadorId);
  }

  emitirA(jugadorId, evento, datos) {
    const ws = this.conexiones.get(jugadorId);

    if (ws?.readyState === 1) {
      ws.send(JSON.stringify({ evento, ...datos }));
    }
  }

  emitirATodos(jugadoresIds, evento, datos) {
    for (const jugadorId of jugadoresIds) {
      this.emitirA(jugadorId, evento, datos);
    }
  }
}

module.exports = ManejadorConexiones;

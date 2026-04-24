class PuntajesController {
  constructor(persistencia) {
    this.persistencia = persistencia;
  }

  async listarPuntajes() {
    return this.persistencia.obtenerPuntajes();
  }
}

module.exports = PuntajesController;

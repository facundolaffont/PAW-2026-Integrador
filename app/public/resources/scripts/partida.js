import { frontLogger as logger } from '/scripts/logger.js';

class Partida {
  constructor({
    jugadorId,
    partidaId,
    estado,
    titulo,
    info,
    lista,
    listaMensajes,
    vistaLobby,
    vistaMesa,
    lobbyPrincipal,
    onCambioVisibilidad = () => {},
  }) {
    this.jugadorId = jugadorId;
    this.partidaId = partidaId;

    this.estado = estado;
    this.titulo = titulo;
    this.info = info;
    this.lista = lista;
    this.listaMensajes = listaMensajes;
    this.vistaLobby = vistaLobby;
    this.vistaMesa = vistaMesa;
    this.lobbyPrincipal = lobbyPrincipal;
    this.onCambioVisibilidad = onCambioVisibilidad;

    logger.info('Cargando página de partida', {
      partidaId: this.partidaId,
      jugadorId: this.jugadorId,
      estado: this.estado,
      titulo: this.titulo,
      info: this.info,
      lista: this.lista,
      listaMensajes: this.listaMensajes,
      vistaLobby: this.vistaLobby,
      vistaMesa: this.vistaMesa,
      lobbyPrincipal: this.lobbyPrincipal,
      onCambioVisibilidad: this.onCambioVisibilidad,
    });

    this.esCreador = false;
    this.maxJugadores = null;
    this.webSocket = null;
    this.partidaIniciadaNotificada = false;
  }

  init() {
    this.#cargarResumen();
    this.#conectarWS();
  }

  iniciarPartida() {
    if (!this.webSocket || this.webSocket.readyState !== WebSocket.OPEN) return;
    this.webSocket.send(JSON.stringify({ accion: 'iniciar-partida' }));
  }

  salir() {
    if (this.webSocket) this.webSocket.close();
    window.location.href = '/public/';
  }

  /**
   * Muestra un mensaje en la lista de mensajes.
   *
   * @param {string} texto - El texto del mensaje.
   * @param {string} tipo - El tipo de mensaje (info, error, etc.).
   */
  #mostrarMensaje(texto, tipo = 'info') {
    const li = document.createElement('li');
    li.className = 'mensaje-item';
    li.dataset.tipo = tipo;

    const ahora = new Date();
    const hora = ahora.toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    li.innerHTML = `<span class="mensaje-hora">${hora}</span> ${texto}`;

    this.listaMensajes.appendChild(li);
    this.listaMensajes.scrollTop = this.listaMensajes.scrollHeight;
  }

  #pintarJugadores(jugadores) {
    this.lista.innerHTML = jugadores
      .map((nombre) => `<li class="jugador-item">${nombre}</li>`)
      .join('');
    const cant = jugadores.length;
    const total = this.maxJugadores != null ? `/${this.maxJugadores}` : '';
    this.info.textContent = `${cant}${total} jugadores en la sala`;
  }

  #normalizarTipoCarta(carta) {
    if (!carta) return null;
    if (carta.tipo === 'numero') return `${carta.color}-${carta.numero}.svg`;
    if (carta.tipo === 'reversa') return `${carta.color}-cambio-sentido.svg`;
    if (carta.tipo === 'salta') {
      if (carta.color === 'azul') return 'azul-pierde.turno.svg';
      return `${carta.color}-pierde-turno.svg`;
    }
    if (carta.tipo === 'roba-dos') return `${carta.color}-roba-dos.svg`;
    if (carta.tipo === 'roba-cuatro') return 'comodín-roba-4.svg';
    if (carta.esComodin || carta.color == null) return 'comodín.svg';
    return null;
  }

  #urlCarta(carta, reverso = false) {
    if (reverso) return '/vectors/reverso-cartas.svg';
    const nombre = this.#normalizarTipoCarta(carta);
    return nombre ? `/vectors/${nombre}` : '/vectors/reverso-cartas.svg';
  }

  #crearCarta(carta, reverso = false, onClick = null) {
    const img = document.createElement('img');
    img.className = 'carta-svg';
    img.src = this.#urlCarta(carta, reverso);
    img.alt = reverso ? 'Carta oculta' : 'Carta';
    if (!reverso && typeof onClick === 'function') {
      img.style.cursor = 'pointer';
      img.addEventListener('click', onClick);
    }
    return img;
  }

  #crearManoHorizontal(cartas, reverso = false, onCartaClick = null) {
    const mano = document.createElement('div');
    mano.className = 'mano-horizontal';
    cartas.forEach((carta) => {
      const clickHandler = !reverso && carta?.id ? () => onCartaClick?.(carta) : null;
      mano.appendChild(this.#crearCarta(carta, reverso, clickHandler));
    });
    return mano;
  }

  #crearManoLateral(cartas, reverso = false) {
    const mano = document.createElement('div');
    mano.className = 'mano-lateral';
    cartas.forEach((carta) => mano.appendChild(this.#crearCarta(carta, reverso)));
    return mano;
  }

  #crearCartasPlaceholder(cantidad) {
    return Array.from({ length: cantidad }, () => ({}));
  }

  #ordenarJugadoresDesdeActual(jugadores) {
    const idxActual = jugadores.findIndex((j) => j.jugadorId === this.jugadorId);
    if (idxActual < 0) return jugadores;
    return jugadores.slice(idxActual).concat(jugadores.slice(0, idxActual));
  }

  #renderMesa(estado) {
    const jugadoresOrdenados = this.#ordenarJugadoresDesdeActual(estado.jugadores || []);
    const jugadorActual = jugadoresOrdenados[0];
    const rivales = jugadoresOrdenados.slice(1);
    const esMiTurno = estado.turno === this.jugadorId;

    this.vistaLobby.hidden = true;
    this.vistaMesa.hidden = false;
    this.lobbyPrincipal.classList.add('partida-activa');
    this.info.textContent = '';

    this.vistaMesa.innerHTML = '';

    const areaArriba = document.createElement('div');
    areaArriba.className = 'area-jugador-arriba';

    if (rivales[0]) {
      const nombre = document.createElement('div');
      nombre.className = 'info-jugador';
      nombre.textContent = rivales[0].nombreUsuario;
      areaArriba.appendChild(nombre);
      areaArriba.appendChild(
        this.#crearManoHorizontal(this.#crearCartasPlaceholder(rivales[0].cantidadCartas), true)
      );
    }

    const zonaCentral = document.createElement('div');
    zonaCentral.className = 'zona-central';

    const lateralIzq = document.createElement('div');
    lateralIzq.className = 'area-jugador-lateral izquierda';
    if (rivales[1]) {
      const nombreIzq = document.createElement('div');
      nombreIzq.className = 'nombre-lateral';
      nombreIzq.textContent = rivales[1].nombreUsuario;
      lateralIzq.appendChild(nombreIzq);
      lateralIzq.appendChild(
        this.#crearManoLateral(this.#crearCartasPlaceholder(rivales[1].cantidadCartas), true)
      );
    }

    const tableroCentral = document.createElement('div');
    tableroCentral.className = 'tablero-central';

    const mazo = document.createElement('div');
    mazo.className = 'mazo';
    mazo.appendChild(this.#crearCarta(null, true));

    const descarte = document.createElement('div');
    descarte.className = 'carta-descarte';
    const descarteVisible = estado.descarte || [];
    descarteVisible.forEach((carta, index) => {
      const cartaEl = this.#crearCarta(carta || null, false);
      cartaEl.style.marginLeft = index === 0 ? '0' : '-32px';
      cartaEl.style.zIndex = String(index + 1);
      cartaEl.style.position = 'relative';
      descarte.appendChild(cartaEl);
    });
    if (descarteVisible.length === 0) {
      descarte.appendChild(this.#crearCarta(estado.cartaEnMesa || null, false));
    }

    tableroCentral.appendChild(mazo);
    tableroCentral.appendChild(descarte);

    const lateralDer = document.createElement('div');
    lateralDer.className = 'area-jugador-lateral derecha';
    if (rivales[2]) {
      const nombreDer = document.createElement('div');
      nombreDer.className = 'nombre-lateral';
      nombreDer.textContent = rivales[2].nombreUsuario;
      lateralDer.appendChild(nombreDer);
      lateralDer.appendChild(
        this.#crearManoLateral(this.#crearCartasPlaceholder(rivales[2].cantidadCartas), true)
      );
    }

    zonaCentral.appendChild(lateralIzq);
    zonaCentral.appendChild(tableroCentral);
    zonaCentral.appendChild(lateralDer);

    const areaAbajo = document.createElement('div');
    areaAbajo.className = 'area-jugador-abajo';

    if (jugadorActual) {
      const nombreActual = document.createElement('div');
      nombreActual.className = 'info-jugador';
      nombreActual.textContent = esMiTurno
        ? `${jugadorActual.nombreUsuario} (tu turno)`
        : jugadorActual.nombreUsuario;
      areaAbajo.appendChild(nombreActual);
      areaAbajo.appendChild(
        this.#crearManoHorizontal(jugadorActual.mano || [], false, (carta) => {
          if (!esMiTurno) return;
          if (!this.webSocket || this.webSocket.readyState !== WebSocket.OPEN) return;
          this.webSocket.send(JSON.stringify({ accion: 'jugar-carta', cartaId: carta.id }));
        })
      );
    }

    this.vistaMesa.appendChild(areaArriba);
    this.vistaMesa.appendChild(zonaCentral);
    this.vistaMesa.appendChild(areaAbajo);
  }

  async #cargarResumen() {
    if (!this.partidaId) {
      this.#mostrarMensaje('Falta el ID de partida.', 'error');
      return;
    }

    try {
      const response = await fetch(`/api/partidas/${encodeURIComponent(this.partidaId)}`, {
        headers: { 'X-Jugador-Id': this.jugadorId || '' },
      });

      // Si la respuesta no es exitosa, intenta obtener el mensaje de error del cuerpo de la respuesta y mostrarlo.
      // Si no se puede obtener un mensaje específico, muestra un mensaje genérico.
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        this.#mostrarMensaje(data.error || 'No se pudo cargar la partida.', 'error');
        return;
      }

      const sala = await response.json();
      this.esCreador = sala.creadorId === this.jugadorId;
      this.maxJugadores = sala.maxJugadores;
      this.titulo.textContent = `Sala de ${sala.jugadores[0] || 'jugador'}`;
      this.#pintarJugadores(sala.jugadores);
      if (this.esCreador) this.onCambioVisibilidad(true);
    } catch (err) {
      logger.error('Error al cargar resumen de partida', {
        error: err,
        partidaId: this.partidaId,
        jugadorId: this.jugadorId,
      });
      this.#mostrarMensaje('Error de red al cargar la partida.', 'error');
    }
  }

  #conectarWS() {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${window.location.host}/ws?jugadorId=${encodeURIComponent(this.jugadorId)}&partidaId=${encodeURIComponent(this.partidaId)}`;
    this.webSocket = new WebSocket(url);

    this.webSocket.addEventListener('open', () => {
      this.estado.textContent = 'En sala';
    });

    this.webSocket.addEventListener('message', (e) => {
      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      this.#manejarEvento(msg);
    });

    this.webSocket.addEventListener('close', () => {
      this.estado.textContent = 'Desconectado';
    });

    this.webSocket.addEventListener('error', (err) => {
      logger.error('WS error', {
        error: err,
        partidaId: this.partidaId,
        jugadorId: this.jugadorId,
      });
      this.estado.textContent = 'Error de conexión';
    });
  }

  #manejarEvento(msg) {
    const { evento, ...datos } = msg;
    switch (evento) {
      case 'estado-partida': {
        const estado = datos.estado;
        if (estado.estado === 'jugando') {
          this.estado.textContent = 'Partida en curso';
          this.onCambioVisibilidad(false);
          if (!this.partidaIniciadaNotificada) {
            this.#mostrarMensaje('La partida ya empezó.');
            this.partidaIniciadaNotificada = true;
          }
          this.#renderMesa(estado);
        }
        const nombres = (estado.jugadores || []).map((j) => j.nombreUsuario);
        this.#pintarJugadores(nombres);
        break;
      }
      case 'jugador-unido': {
        this.#mostrarMensaje(`${datos.nombreUsuario || 'Un jugador'} ingresó a la sala.`);
        this.#cargarResumen();
        break;
      }
      case 'jugador-salio': {
        this.#mostrarMensaje(`${datos.nombreUsuario || 'Un jugador'} salió de la sala.`);
        this.#cargarResumen();
        break;
      }
      case 'turno-cambiado': {
        this.estado.textContent = 'Partida en curso';
        this.onCambioVisibilidad(false);
        break;
      }
      case 'error': {
        this.#mostrarMensaje(datos.mensaje || 'Error', 'error');
        break;
      }
      case 'jugador-abandono': {
        this.#mostrarMensaje(
          `${datos.nombreUsuario || 'Un jugador'} abandonó la partida. Se finaliza el juego.`,
          'error'
        );
        break;
      }
    }
  }
}

export default Partida;

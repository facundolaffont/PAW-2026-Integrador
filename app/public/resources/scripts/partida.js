import { frontLogger as logger } from '/scripts/logger.js';

class Partida {
  /**
   * Crea una instancia del controlador de la pantalla de partida.
   *
   * @param {Object} opciones - Dependencias y elementos necesarios para la vista.
   * @param {string} opciones.jugadorId - Identificador del jugador actual.
   * @param {string} opciones.partidaId - Identificador de la partida actual.
   * @param {HTMLElement} opciones.estado - Nodo donde se informa el estado de conexión/partida.
   * @param {HTMLElement} opciones.titulo - Nodo del título del lobby.
   * @param {HTMLElement} opciones.info - Nodo informativo del lobby.
   * @param {HTMLElement} opciones.lista - Lista de jugadores del lobby.
   * @param {HTMLElement} opciones.listaMensajes - Lista de actividad de la partida.
   * @param {HTMLElement} opciones.vistaLobby - Contenedor de la vista de lobby.
   * @param {HTMLElement} opciones.vistaMesa - Contenedor de la vista de mesa.
   * @param {HTMLElement} opciones.lobbyPrincipal - Contenedor principal del layout.
   * @param {?HTMLElement} [opciones.btnToggleBitacora=null] - Botón para alternar la bitácora en mobile.
   * @param {?HTMLElement} [opciones.panelBitacora=null] - Panel visual de la bitácora.
   * @param {Function} [opciones.onCambioVisibilidad=() => {}] - Callback para mostrar u ocultar acciones del lobby.
   */
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
    btnToggleBitacora = null,
    panelBitacora = null,
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
    this.btnToggleBitacora = btnToggleBitacora;
    this.panelBitacora = panelBitacora;
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
      btnToggleBitacora: this.btnToggleBitacora,
      panelBitacora: this.panelBitacora,
      onCambioVisibilidad: this.onCambioVisibilidad,
    });

    this.esCreador = false;
    this.maxJugadores = null;
    this.webSocket = null;
    this.partidaIniciadaNotificada = false;
    this.intentosReconexion = 0;
    this.cerrandoIntencionalmente = false;
    this.timeoutReconexion = null;
    this.MAX_INTENTOS_RECONEXION = 5;
    this.jugadoresActuales = [];
    this.estadoMesaActual = null;
    this.selectorColorActivo = null;
  }

  /**
   * Inicializa la pantalla configurando UI auxiliar, cargando el resumen de la sala y abriendo el WebSocket.
   *
   * @returns {void}
   */
  init() {
    this.#configurarBitacoraMobile();
    this.#cargarResumen();
    this.#conectarWS();
  }

  /**
   * Configura el comportamiento responsive del panel de actividad en pantallas pequeñas.
   *
   * @returns {void}
   */
  #configurarBitacoraMobile() {
    if (!this.btnToggleBitacora || !this.panelBitacora) return;

    const aplicarEstadoPorAncho = () => {
      if (window.innerWidth <= 768) {
        this.panelBitacora.style.display = 'none';
        this.btnToggleBitacora.textContent = 'Actividad';
      } else {
        this.panelBitacora.style.display = '';
        this.btnToggleBitacora.textContent = 'Ocultar';
      }
    };

    this.btnToggleBitacora.addEventListener('click', () => {
      const oculto = this.panelBitacora.style.display === 'none';
      this.panelBitacora.style.display = oculto ? '' : 'none';
      this.btnToggleBitacora.textContent = oculto ? 'Ocultar' : 'Actividad';
    });

    aplicarEstadoPorAncho();
    window.addEventListener('resize', aplicarEstadoPorAncho);
  }

  /**
   * Solicita al servidor el inicio de la partida actual.
   *
   * @returns {void}
   */
  iniciarPartida() {
    if (!this.webSocket || this.webSocket.readyState !== WebSocket.OPEN) return;
    this.webSocket.send(JSON.stringify({ accion: 'iniciar-partida' }));
  }

  /**
   * Abandona la partida, cierra la conexión WebSocket y navega de vuelta al inicio público.
   *
   * @returns {void}
   */
  salir() {
    this.cerrandoIntencionalmente = true;
    if (this.timeoutReconexion) clearTimeout(this.timeoutReconexion);
    if (this.webSocket && this.webSocket.readyState === WebSocket.OPEN) {
      this.webSocket.send(JSON.stringify({ accion: 'abandonar-partida' }));
      setTimeout(() => {
        if (this.webSocket) this.webSocket.close();
      }, 80);
    } else if (this.webSocket) {
      this.webSocket.close();
    }
    window.__navInterno = true;
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
    li.innerHTML = `<span class="mensaje-hora">${hora}</span><div class="mensaje-texto">${texto}</div>`;

    this.listaMensajes.prepend(li);
    this.listaMensajes.scrollTop = 0;
  }

  /**
   * Inserta en la actividad una tabla con los puntajes acumulados al finalizar una ronda.
   *
   * @param {Object.<string, number>} [puntajesRonda={}] - Mapa de puntajes por jugador.
   * @param {?string} [ganadorRonda=null] - Identificador del jugador ganador de la ronda.
   * @returns {void}
   */
  #mostrarTablaPuntajesRonda(puntajesRonda = {}, ganadorRonda = null) {
    const jugadores = this.jugadoresActuales || [];

    const filas = jugadores
      .map((j) => ({
        jugadorId: j.jugadorId,
        nombre: j.nombreUsuario,
        puntaje: Number(puntajesRonda[j.jugadorId]) || 0,
      }))
      .sort((a, b) => b.puntaje - a.puntaje || a.nombre.localeCompare(b.nombre, 'es'));

    const li = document.createElement('li');
    li.className = 'mensaje-item mensaje-item-tabla';
    li.dataset.tipo = 'info';

    const ahora = new Date();
    const hora = ahora.toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const titulo = document.createElement('div');
    titulo.className = 'puntajes-ronda-titulo';
    titulo.innerHTML = `<span class="mensaje-hora">${hora}</span><div class="mensaje-texto">Puntajes de ronda</div>`;

    const tabla = document.createElement('table');
    tabla.className = 'puntajes-ronda-tabla';

    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>Jugador</th><th>Puntos</th></tr>';
    tabla.appendChild(thead);

    const tbody = document.createElement('tbody');
    filas.forEach((fila) => {
      const tr = document.createElement('tr');
      if (String(fila.jugadorId) === String(ganadorRonda)) {
        tr.classList.add('ganador-ronda');
      }

      const tdNombre = document.createElement('td');
      tdNombre.textContent = fila.nombre;

      const tdPuntaje = document.createElement('td');
      tdPuntaje.textContent = String(fila.puntaje);

      tr.appendChild(tdNombre);
      tr.appendChild(tdPuntaje);
      tbody.appendChild(tr);
    });
    tabla.appendChild(tbody);

    li.appendChild(titulo);
    li.appendChild(tabla);

    this.listaMensajes.prepend(li);
    this.listaMensajes.scrollTop = 0;
  }

  /**
   * Dibuja en el lobby la lista de jugadores presentes en la sala.
   *
   * @param {string[]} jugadores - Nombres de jugadores a renderizar.
   * @returns {void}
   */
  #pintarJugadores(jugadores) {
    this.lista.innerHTML = jugadores
      .map((nombre) => `<li class="jugador-item">${nombre}</li>`)
      .join('');
    const cant = jugadores.length;
    const total = this.maxJugadores != null ? `/${this.maxJugadores}` : '';
    this.info.textContent = `${cant}${total} jugadores en la sala`;
  }

  /**
   * Traduce una carta a su nombre de archivo SVG correspondiente.
   *
   * @param {?Object} carta - Carta a representar.
   * @returns {?string} Nombre del archivo SVG o null si no puede resolverse.
   */
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

  /**
   * Construye la URL del recurso gráfico de una carta o de su reverso.
   *
   * @param {?Object} carta - Carta a representar.
   * @param {boolean} [reverso=false] - Indica si debe devolverse el reverso de carta.
   * @returns {string} URL del recurso gráfico.
   */
  #urlCarta(carta, reverso = false) {
    if (reverso) return '/vectors/reverso-cartas.svg';
    const nombre = this.#normalizarTipoCarta(carta);
    return nombre ? `/vectors/${nombre}` : '/vectors/reverso-cartas.svg';
  }

  /**
   * Crea el nodo visual de una carta.
   *
   * @param {?Object} carta - Carta a dibujar.
   * @param {boolean} [reverso=false] - Indica si debe mostrarse el reverso.
   * @param {?Function} [onClick=null] - Callback opcional para clicks sobre la carta.
   * @returns {HTMLImageElement} Elemento de imagen de la carta.
   */
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

  /**
   * Genera una mano horizontal para jugadores de arriba o abajo.
   *
   * @param {Object[]} cartas - Cartas a renderizar.
   * @param {boolean} [reverso=false] - Indica si las cartas se muestran ocultas.
   * @param {?Function} [onCartaClick=null] - Callback para clicks sobre cartas visibles.
   * @returns {HTMLDivElement} Contenedor de la mano horizontal.
   */
  #crearManoHorizontal(cartas, reverso = false, onCartaClick = null) {
    const mano = document.createElement('div');
    mano.className = 'mano-horizontal';
    cartas.forEach((carta) => {
      const clickHandler = !reverso && carta?.id ? () => onCartaClick?.(carta) : null;
      mano.appendChild(this.#crearCarta(carta, reverso, clickHandler));
    });
    return mano;
  }

  /**
   * Genera una mano lateral para jugadores ubicados a izquierda o derecha.
   *
   * @param {Object[]} cartas - Cartas a renderizar.
   * @param {boolean} [reverso=false] - Indica si las cartas se muestran ocultas.
   * @returns {HTMLDivElement} Contenedor de la mano lateral.
   */
  #crearManoLateral(cartas, reverso = false) {
    const mano = document.createElement('div');
    mano.className = 'mano-lateral';
    cartas.forEach((carta) => mano.appendChild(this.#crearCarta(carta, reverso)));
    return mano;
  }

  /**
   * Crea cartas vacías para representar manos ocultas de rivales.
   *
   * @param {number} cantidad - Cantidad de cartas placeholder a generar.
   * @returns {Object[]} Lista de objetos vacíos.
   */
  #crearCartasPlaceholder(cantidad) {
    return Array.from({ length: cantidad }, () => ({}));
  }

  /**
   * Convierte un identificador de color interno a una etiqueta legible para UI.
   *
   * @param {?string} color - Color interno de la carta.
   * @returns {string} Nombre de color legible.
   */
  #nombreColor(color) {
    const nombres = {
      rojo: 'Rojo',
      azul: 'Azul',
      verde: 'Verde',
      amarillo: 'Amarillo',
    };
    return nombres[color] || 'Sin color';
  }

  /**
   * Busca el nombre visible de un jugador a partir de su identificador.
   *
   * @param {string|number} jugadorId - Identificador del jugador.
   * @returns {string} Nombre del jugador o un fallback genérico.
   */
  #nombreJugador(jugadorId) {
    const jugador = this.jugadoresActuales.find((j) => String(j.jugadorId) === String(jugadorId));
    return jugador?.nombreUsuario || 'Un jugador';
  }

  /**
   * Genera una descripción textual de una carta para la bitácora de actividad.
   *
   * @param {?Object} carta - Carta a describir.
   * @returns {string} Descripción legible de la carta.
   */
  #descripcionCarta(carta) {
    if (!carta) return 'una carta';

    const color = this.#nombreColor(carta.color);

    if (carta.tipo === 'numero') return `${color} ${carta.numero}`;
    if (carta.tipo === 'reversa') return `${color} Reversa`;
    if (carta.tipo === 'salta') return `${color} Salta`;
    if (carta.tipo === 'roba-dos') return `${color} +2`;
    if (carta.tipo === 'roba-cuatro') return 'Comodín +4';
    if (carta.tipo === 'comodin') return 'Comodín';

    return carta.tipo;
  }

  /**
   * Muestra un selector visual para elegir el color de un comodín.
   *
   * @returns {Promise<?string>} Color elegido o null si el usuario cancela.
   */
  #pedirColorComodin() {
    const colores = ['rojo', 'azul', 'verde', 'amarillo'];
    if (this.selectorColorActivo) {
      this.selectorColorActivo.remove();
      this.selectorColorActivo = null;
    }

    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'selector-color-overlay';

      const panel = document.createElement('div');
      panel.className = 'selector-color-panel';

      const titulo = document.createElement('div');
      titulo.className = 'selector-color-titulo';
      titulo.textContent = 'Elegí un color';

      const botones = document.createElement('div');
      botones.className = 'selector-color-botones';

      const cerrar = (color) => {
        overlay.remove();
        if (this.selectorColorActivo === overlay) {
          this.selectorColorActivo = null;
        }
        resolve(color);
      };

      colores.forEach((color) => {
        const boton = document.createElement('button');
        boton.type = 'button';
        boton.className = `selector-color-boton color-${color}`;
        boton.innerHTML = `<span class="selector-color-muestra"></span><span>${this.#nombreColor(color)}</span>`;
        boton.addEventListener('click', () => cerrar(color));
        botones.appendChild(boton);
      });

      const btnCancelar = document.createElement('button');
      btnCancelar.type = 'button';
      btnCancelar.className = 'selector-color-cancelar';
      btnCancelar.textContent = 'Cancelar';
      btnCancelar.addEventListener('click', () => cerrar(null));

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) cerrar(null);
      });

      panel.appendChild(titulo);
      panel.appendChild(botones);
      panel.appendChild(btnCancelar);
      overlay.appendChild(panel);

      this.selectorColorActivo = overlay;
      this.vistaMesa.appendChild(overlay);
    });
  }

  /**
   * Determina si una carta es un comodín o una carta especial sin color propio.
   *
   * @param {?Object} carta - Carta a evaluar.
   * @returns {boolean} True si la carta no tiene color.
   */
  #esCartaSinColor(carta) {
    return !!carta && carta.color == null;
  }

  /**
   * Valida localmente si una carta sin color puede jugarse en el estado actual de la mesa.
   *
   * @param {?Object} carta - Carta a validar.
   * @returns {boolean} True si la carta puede jugarse según la penalidad actual.
   */
  #esJugadaValidaEnCliente(carta) {
    if (!carta || !this.estadoMesaActual) return false;

    const penalidad = this.estadoMesaActual.penalidad || 0;
    const tipoPenalidad = this.estadoMesaActual.tipoPenalidad || null;

    if (this.#esCartaSinColor(carta)) {
      if (penalidad > 0) return carta.tipo === tipoPenalidad;
      return true;
    }

    return true;
  }

  /**
   * Reordena la lista de jugadores para que el jugador actual quede en la primera posición.
   *
   * @param {Object[]} jugadores - Jugadores de la partida en orden lógico.
   * @returns {Object[]} Jugadores reordenados desde la perspectiva local.
   */
  #ordenarJugadoresDesdeActual(jugadores) {
    const idxActual = jugadores.findIndex((j) => j.jugadorId === this.jugadorId);
    if (idxActual < 0) return jugadores;
    return jugadores.slice(idxActual).concat(jugadores.slice(0, idxActual));
  }

  /**
   * Renderiza el estado completo de la mesa de juego para el jugador actual.
   *
   * @param {Object} estado - Estado serializado de la partida recibido desde el servidor.
   * @returns {void}
   */
  #renderMesa(estado) {
    this.estadoMesaActual = estado;

    const jugadoresOrdenados = this.#ordenarJugadoresDesdeActual(estado.jugadores || []);
    const jugadorActual = jugadoresOrdenados[0];
    const rivales = jugadoresOrdenados.slice(1);
    const esMiTurno = estado.turno === this.jugadorId;
    const turnoActualId = estado.turno;

    const textoTurnoJugador = (jugador) => {
      if (!jugador) return '';
      if (String(jugador.jugadorId) !== String(turnoActualId)) return jugador.nombreUsuario;
      return String(jugador.jugadorId) === String(this.jugadorId)
        ? `${jugador.nombreUsuario} (tu turno)`
        : `${jugador.nombreUsuario} (en turno)`;
    };

    // Ubica a los rivales para que el orden visual siga el sentido de juego.
    // Horario: abajo -> izquierda -> arriba -> derecha.
    // Antihorario: abajo -> derecha -> arriba -> izquierda.
    const rivalIzquierda = rivales[0];
    const rivalArriba = rivales[1];
    const rivalDerecha = rivales[2];

    this.vistaLobby.hidden = true;
    this.vistaMesa.hidden = false;
    this.lobbyPrincipal.classList.add('partida-activa');
    this.info.textContent = '';

    this.vistaMesa.innerHTML = '';

    const areaArriba = document.createElement('div');
    areaArriba.className = 'area-jugador-arriba';

    if (rivalArriba) {
      const nombre = document.createElement('div');
      nombre.className = 'info-jugador';
      nombre.textContent = textoTurnoJugador(rivalArriba);
      areaArriba.appendChild(nombre);
      areaArriba.appendChild(
        this.#crearManoHorizontal(this.#crearCartasPlaceholder(rivalArriba.cantidadCartas), true)
      );
    }

    const zonaCentral = document.createElement('div');
    zonaCentral.className = 'zona-central';

    const lateralIzq = document.createElement('div');
    lateralIzq.className = 'area-jugador-lateral izquierda';
    if (rivalIzquierda) {
      const nombreIzq = document.createElement('div');
      nombreIzq.className = 'nombre-lateral';
      nombreIzq.textContent = textoTurnoJugador(rivalIzquierda);
      lateralIzq.appendChild(nombreIzq);
      lateralIzq.appendChild(
        this.#crearManoLateral(this.#crearCartasPlaceholder(rivalIzquierda.cantidadCartas), true)
      );
    }

    const tableroCentral = document.createElement('div');
    tableroCentral.className = 'tablero-central';

    const mazo = document.createElement('div');
    mazo.className = 'mazo';
    mazo.appendChild(this.#crearCarta(null, true));
    if (esMiTurno) {
      mazo.style.cursor = 'pointer';
      mazo.addEventListener('click', () => {
        if (!this.webSocket || this.webSocket.readyState !== WebSocket.OPEN) return;
        this.webSocket.send(JSON.stringify({ accion: 'robar-carta' }));
      });
    }

    const descarte = document.createElement('div');
    descarte.className = 'carta-descarte';
    const descarteVisible = estado.descarte || [];
    const ultimaCarta = descarteVisible[descarteVisible.length - 1] || estado.cartaEnMesa || null;
    descarte.appendChild(this.#crearCarta(ultimaCarta, false));

    const colorActual = ultimaCarta?.colorElegido || ultimaCarta?.color || null;
    const indicadorColor = document.createElement('div');
    indicadorColor.className = `indicador-color${colorActual ? ` color-${colorActual}` : ''}`;
    indicadorColor.textContent = `Color actual: ${this.#nombreColor(colorActual)}`;

    tableroCentral.appendChild(mazo);
    tableroCentral.appendChild(descarte);
    tableroCentral.appendChild(indicadorColor);

    const lateralDer = document.createElement('div');
    lateralDer.className = 'area-jugador-lateral derecha';
    if (rivalDerecha) {
      const nombreDer = document.createElement('div');
      nombreDer.className = 'nombre-lateral';
      nombreDer.textContent = textoTurnoJugador(rivalDerecha);
      lateralDer.appendChild(nombreDer);
      lateralDer.appendChild(
        this.#crearManoLateral(this.#crearCartasPlaceholder(rivalDerecha.cantidadCartas), true)
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
      nombreActual.textContent = textoTurnoJugador(jugadorActual);
      areaAbajo.appendChild(nombreActual);
      areaAbajo.appendChild(
        this.#crearManoHorizontal(jugadorActual.mano || [], false, async (carta) => {
          if (!esMiTurno) return;
          if (!this.webSocket || this.webSocket.readyState !== WebSocket.OPEN) return;

          const payload = { accion: 'jugar-carta', cartaId: carta.id };
          if (this.#esCartaSinColor(carta)) {
            if (!this.#esJugadaValidaEnCliente(carta)) {
              this.#mostrarMensaje('Jugada inválida para la carta en mesa', 'error');
              return;
            }
            const colorElegido = await this.#pedirColorComodin();
            if (!colorElegido) return;
            payload.colorElegido = colorElegido;
          }

          this.webSocket.send(JSON.stringify(payload));
        })
      );
    }

    this.vistaMesa.appendChild(areaArriba);
    this.vistaMesa.appendChild(zonaCentral);
    this.vistaMesa.appendChild(areaAbajo);
  }

  /**
   * Obtiene el resumen actual de la sala por HTTP y actualiza el lobby con esa información.
   *
   * @returns {Promise<void>}
   */
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

  /**
   * Abre y configura la conexión WebSocket de la partida.
   *
   * @returns {void}
   */
  #conectarWS() {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${window.location.host}/ws?jugadorId=${encodeURIComponent(this.jugadorId)}&partidaId=${encodeURIComponent(this.partidaId)}`;
    this.webSocket = new WebSocket(url);

    this.webSocket.addEventListener('open', () => {
      const eraReconexion = this.intentosReconexion > 0;
      this.intentosReconexion = 0;
      this.estado.textContent = eraReconexion ? 'Reconectado' : 'En sala';
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
      if (this.cerrandoIntencionalmente) {
        this.estado.textContent = 'Desconectado';
        return;
      }
      this.#intentarReconectar();
    });

    this.webSocket.addEventListener('error', (err) => {
      logger.error('WS error', {
        error: err,
        partidaId: this.partidaId,
        jugadorId: this.jugadorId,
      });
    });
  }

  /**
   * Programa un intento de reconexión con backoff exponencial acotado.
   *
   * @returns {void}
   */
  #intentarReconectar() {
    if (this.intentosReconexion >= this.MAX_INTENTOS_RECONEXION) {
      this.estado.textContent = 'No se pudo reconectar';
      this.#mostrarMensaje('No se pudo reconectar al servidor.', 'error');
      return;
    }

    this.intentosReconexion += 1;
    const delay = Math.min(1000 * 2 ** (this.intentosReconexion - 1), 8000);
    this.estado.textContent = `Reconectando... (${this.intentosReconexion}/${this.MAX_INTENTOS_RECONEXION})`;

    this.timeoutReconexion = setTimeout(() => {
      this.#conectarWS();
    }, delay);
  }

  /**
   * Procesa los eventos recibidos desde el WebSocket y actualiza UI y bitácora.
   *
   * @param {Object} msg - Mensaje recibido desde el servidor.
   * @returns {void}
   */
  #manejarEvento(msg) {
    const { evento, ...datos } = msg;
    switch (evento) {
      case 'estado-partida': {
        const estado = datos.estado;
        this.jugadoresActuales = estado.jugadores || [];
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
      case 'carta-jugada': {
        const nombre = this.#nombreJugador(datos.jugadorId);
        const carta = this.#descripcionCarta(datos.carta);
        const colorElegido = datos.carta?.colorElegido
          ? ` (elige ${this.#nombreColor(datos.carta.colorElegido)})`
          : '';
        this.#mostrarMensaje(`${nombre} jugó ${carta}${colorElegido}.`);
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

        const robo = datos['robó'] || datos.robo;
        if (robo && robo.jugadorId != null) {
          const nombre = this.#nombreJugador(robo.jugadorId);
          const cantidad = Number(robo.cantidad) || 0;
          const palabraCarta = cantidad === 1 ? 'carta' : 'cartas';
          this.#mostrarMensaje(`${nombre} robó ${cantidad} ${palabraCarta}.`);
        }

        break;
      }
      case 'ronda-terminada': {
        this.#mostrarMensaje('Ronda terminada.');
        this.#mostrarTablaPuntajesRonda(datos.puntajesRonda || {}, datos.ganadorRonda);
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
      case 'jugador-desconectado': {
        const segundos = Math.round((datos.gracePeriodMs || 30000) / 1000);
        this.#mostrarMensaje(
          `${datos.nombreUsuario || 'Un jugador'} se desconectó. Esperando reconexión (${segundos}s)...`,
          'error'
        );
        break;
      }
      case 'jugador-reconectado': {
        this.#mostrarMensaje(`${datos.nombreUsuario || 'Un jugador'} volvió a la partida.`);
        break;
      }
    }
  }
}

export default Partida;

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
    inputChat = null,
    formChat = null,
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
    this.inputChat = inputChat;
    this.formChat = formChat;
    this.onCambioVisibilidad = onCambioVisibilidad;
    this.tabActivo = 'actividad';
    this.chatHidratado = false;
    this.idsMensajesChatVistos = new Set();
    this.idsMensajesEnviados = new Set();

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
    this.numeroRondaActual = 0;
  }

  /**
   * Inicializa la pantalla configurando UI auxiliar, cargando el resumen de la sala y abriendo el WebSocket.
   *
   * @returns {void}
   */
  init() {
    this.#configurarBitacoraMobile();
    this.#configurarTabs();
    this.#configurarChat();
    this.#cargarResumen();
    this.#conectarWS();
  }

  #configurarChat() {
    if (!this.formChat || !this.inputChat) return;
    this.formChat.addEventListener('submit', (e) => {
      e.preventDefault();
      this.enviarChat(this.inputChat.value);
      this.inputChat.value = '';
    });
  }

  #configurarTabs() {
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.#cambiarTab(btn.dataset.tab);
      });
    });
  }

  #cambiarTab(tab) {
    if (tab === this.tabActivo) return;
    this.tabActivo = tab;

    document.querySelectorAll('.tab').forEach((btn) => {
      btn.classList.toggle('tab--active', btn.dataset.tab === tab);
    });

    if (this.panelBitacora) {
      this.panelBitacora.classList.toggle('tab-chat', tab === 'chat');
    }
  }

  enviarChat(texto) {
    if (!texto || !texto.trim()) return;
    if (!this.webSocket || this.webSocket.readyState !== WebSocket.OPEN) return;

    const limpio = texto.trim();
    const mensaje = {
      jugadorId: this.jugadorId,
      nombreUsuario: sessionStorage.getItem('nombreUsuario') || 'Yo',
      texto: limpio,
      timestamp: Date.now(),
    };

    this.#mostrarMensajeChat(mensaje);

    const claveEnviado = `${this.jugadorId}|${limpio}`;
    this.idsMensajesEnviados.add(claveEnviado);
    this.webSocket.send(JSON.stringify({ accion: 'chat', texto: limpio }));
  }

  /**
   * Configura el comportamiento responsive del panel de actividad en pantallas
   * pequeñas.
   *
   * @returns {void}
   */
  #configurarBitacoraMobile() {
    if (!this.btnToggleBitacora || !this.panelBitacora) return;

    let bitacoraAbiertaManualmente = false;
    let ultimoAnchoViewport = window.innerWidth;

    const actualizarTextoToggle = () => {
      const oculto = this.panelBitacora.style.display === 'none';
      this.btnToggleBitacora.textContent = oculto ? 'Mostrar panel' : 'Ocultar panel';
    };

    const actualizarEstadoBitacora = () => {
      if (!this.lobbyPrincipal) return;
      const oculto = this.panelBitacora.style.display === 'none';
      this.lobbyPrincipal.classList.toggle('bitacora-oculta', oculto);
    };

    const esMobileVertical = () =>
      window.matchMedia('(max-width: 1000px) and (orientation: portrait)').matches;

    const aplicarEstadoPorAncho = () => {
      if (esMobileVertical()) {
        if (!bitacoraAbiertaManualmente) {
          this.panelBitacora.style.display = 'none';
        }
      } else {
        bitacoraAbiertaManualmente = false;
        this.panelBitacora.style.display = '';
      }
      actualizarTextoToggle();
      actualizarEstadoBitacora();
    };

    const cerrarBitacora = () => {
      bitacoraAbiertaManualmente = false;
      this.panelBitacora.style.display = 'none';
      actualizarTextoToggle();
      actualizarEstadoBitacora();
    };

    this.btnToggleBitacora.addEventListener('click', () => {
      const oculto = this.panelBitacora.style.display === 'none';
      if (oculto) {
        bitacoraAbiertaManualmente = true;
        this.panelBitacora.style.display = '';
      } else {
        cerrarBitacora();
        return;
      }
      actualizarTextoToggle();
      actualizarEstadoBitacora();
    });

    const btnCerrar = document.getElementById('btn-cerrar-bitacora');
    if (btnCerrar) {
      btnCerrar.addEventListener('click', cerrarBitacora);
    }

    // El teclado virtual en portrait dispara resize sin cambiar el ancho;
    // ignorarlo evita que se cierre el panel mientras se escribe en el chat.
    const onCambioViewport = () => {
      const ancho = window.innerWidth;
      if (ancho === ultimoAnchoViewport) return;
      ultimoAnchoViewport = ancho;
      aplicarEstadoPorAncho();
    };

    aplicarEstadoPorAncho();
    ultimoAnchoViewport = window.innerWidth;
    window.addEventListener('resize', onCambioViewport);
    window.addEventListener('orientationchange', () => {
      setTimeout(() => {
        ultimoAnchoViewport = window.innerWidth;
        aplicarEstadoPorAncho();
      }, 150);
    });
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

  #actualizarEstadoPartida(estadoPartida) {
    if (!estadoPartida) {
      this.estado.textContent = 'Conectando...';
      return;
    }

    if (estadoPartida.estado === 'jugando') {
      const numeroRonda = Number(estadoPartida.numeroRonda) || 1;
      this.estado.textContent = `Partida en curso · Ronda ${numeroRonda}`;
      return;
    }

    if (estadoPartida.estado === 'entre-rondas') {
      const numeroRonda = Number(estadoPartida.numeroRonda) || 1;
      this.estado.textContent = `Fin de ronda · Ronda ${numeroRonda}`;
      return;
    }

    if (estadoPartida.estado === 'esperando') {
      this.estado.textContent = 'Esperando jugadores';
      return;
    }

    if (estadoPartida.estado === 'terminada') {
      this.estado.textContent = 'Partida terminada';
      return;
    }

    this.estado.textContent = 'Conectado';
  }

  /**
   * Indica si el jugador actual es el creador de la sala.
   *
   * @param {string|number|null|undefined} creadorId - Identificador del creador.
   * @returns {boolean}
   */
  #esCreadorDePartida(creadorId) {
    return creadorId != null && String(creadorId) === String(this.jugadorId);
  }

  /**
   * Muestra u oculta el botón de iniciar partida según rol y estado de la sala.
   *
   * @param {string} [estadoPartida='esperando'] - Estado actual de la partida.
   * @returns {void}
   */
  #actualizarBotonIniciar(estadoPartida = 'esperando') {
    this.onCambioVisibilidad(this.esCreador && estadoPartida === 'esperando');
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
   * Renderiza una tabla de puntajes dentro de un contenedor del modal.
   *
   * @param {HTMLElement} contenedor - Elemento donde se renderiza la tabla.
   * @param {Object.<string, number>} puntajes - Mapa de puntajes por jugador.
   * @param {?string} ganadorId - Identificador del jugador ganador.
   * @returns {void}
   */
  #renderTablaPuntajesEnModal(contenedor, puntajes, ganadorId) {
    const jugadores = this.jugadoresActuales || [];

    const filas = jugadores
      .map((j) => ({
        jugadorId: j.jugadorId,
        nombre: j.nombreUsuario,
        puntaje: Number(puntajes[j.jugadorId]) || 0,
      }))
      .sort((a, b) => b.puntaje - a.puntaje || a.nombre.localeCompare(b.nombre, 'es'));

    const tabla = document.createElement('table');
    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>Jugador</th><th>Puntos</th></tr>';
    tabla.appendChild(thead);

    const tbody = document.createElement('tbody');
    filas.forEach((fila) => {
      const tr = document.createElement('tr');
      if (String(fila.jugadorId) === String(ganadorId)) {
        tr.classList.add('ganador');
      }
      tr.innerHTML = `<td>${fila.nombre}</td><td>${fila.puntaje}</td>`;
      tbody.appendChild(tr);
    });
    tabla.appendChild(tbody);

    contenedor.innerHTML = '';
    contenedor.appendChild(tabla);
  }

  /**
   * Cierra el modal de fin de ronda y limpia el temporizador.
   *
   * @param {HTMLElement} modal - Elemento del modal.
   * @param {number} intervalo - ID del intervalo del temporizador.
   * @returns {void}
   */
  #cerrarModalFinRonda(modal, intervalo) {
    clearInterval(intervalo);
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-fin-abierto');
    this.#enviarContinuarRonda();
  }

  /**
   * Notifica al servidor que el jugador está listo para continuar tras el fin de ronda.
   *
   * @returns {void}
   */
  #enviarContinuarRonda() {
    if (this.webSocket?.readyState !== WebSocket.OPEN) return;
    this.webSocket.send(JSON.stringify({ accion: 'continuar-ronda' }));
  }

  /**
   * Muestra el modal de fin de ronda con el ganador y los puntajes.
   * Inicia un temporizador de 30 segundos tras el cual continúa automáticamente.
   *
   * @param {string} ganadorRonda - ID del jugador ganador.
   * @param {Object.<string, number>} puntajesRonda - Mapa de puntajes acumulados.
   * @returns {void}
   */
  #mostrarModalFinRonda(ganadorRonda, puntajesRonda) {
    const modal = document.getElementById('modal-fin-ronda');
    if (!modal) return;

    const ganadorEl = document.getElementById('ronda-ganador-texto');
    const tablaEl = document.getElementById('ronda-tabla-puntajes');
    const timerEl = document.getElementById('ronda-timer');

    const ganadorNombre = this.#nombreJugador(ganadorRonda);
    ganadorEl.innerHTML = `¡${ganadorNombre} ganó la ronda!`;

    this.#renderTablaPuntajesEnModal(tablaEl, puntajesRonda, ganadorRonda);

    let segundosRestantes = 30;
    timerEl.textContent = `Continuando en ${segundosRestantes}...`;
    const intervalo = setInterval(() => {
      segundosRestantes -= 1;
      timerEl.textContent = `Continuando en ${segundosRestantes}...`;
      if (segundosRestantes <= 0) {
        this.#cerrarModalFinRonda(modal, intervalo);
      }
    }, 1000);

    const btnContinuar = document.getElementById('btn-ronda-continuar');
    btnContinuar.addEventListener(
      'click',
      () => {
        this.#cerrarModalFinRonda(modal, intervalo);
      },
      { once: true }
    );

    const btnSalir = document.getElementById('btn-ronda-salir');
    btnSalir.addEventListener(
      'click',
      () => {
        clearInterval(intervalo);
        modal.hidden = true;
        modal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('modal-fin-abierto');
        this.salir();
      },
      { once: true }
    );

    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-fin-abierto');
  }

  /**
   * Muestra el modal de fin de partida con el ganador y la clasificación final.
   * Solo dispone de botón Salir, que no penaliza el ranking.
   *
   * @param {Object[]} ranking - Lista ordenada de jugadores con puntajes.
   * @returns {void}
   */
  #mostrarModalFinPartida(ranking) {
    const modal = document.getElementById('modal-fin-partida');
    if (!modal) return;

    const ganadorEl = document.getElementById('partida-ganador-texto');
    const tablaEl = document.getElementById('partida-tabla-puntajes');

    const ganador = ranking[0];
    ganadorEl.textContent = `¡${ganador?.nombre || 'Un jugador'} ganó la partida!`;

    const puntajesFinales = {};
    for (const r of ranking || []) {
      puntajesFinales[r.jugadorId] = r.puntaje;
    }
    this.#renderTablaPuntajesEnModal(tablaEl, puntajesFinales, ganador?.jugadorId);

    const btnSalir = document.getElementById('btn-partida-salir');
    btnSalir.addEventListener(
      'click',
      () => {
        modal.hidden = true;
        modal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('modal-fin-abierto');
        this.#salirSinPenalizar();
      },
      { once: true }
    );

    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-fin-abierto');
  }

  /**
   * Sale de la partida sin enviar abandono ni penalizar el ranking.
   * Usado desde el modal de fin de partida.
   *
   * @returns {void}
   */
  #salirSinPenalizar() {
    this.cerrandoIntencionalmente = true;
    if (this.timeoutReconexion) clearTimeout(this.timeoutReconexion);
    if (this.webSocket) {
      this.webSocket.close();
    }
    window.__navInterno = true;
    window.location.href = '/public/';
  }

  /**
   * Renderiza un mensaje del chat en la lista.
   *
   * @param {Object} mensaje - Objeto con la información del mensaje.
   * @param {number} mensaje.jugadorId - ID del jugador que envió el mensaje.
   * @param {string} mensaje.nombreUsuario - Nombre del usuario que envió el mensaje.
   * @param {string} mensaje.texto - Texto del mensaje.
   * @param {number} mensaje.timestamp - Marca de tiempo del mensaje.
   */
  #mostrarMensajeChat({ jugadorId, nombreUsuario, texto, timestamp }) {
    if (!this.listaMensajes) return;

    // Deduplica si ya lo renderizamos localmente (optimista)
    const claveEnviado = `${jugadorId}|${texto}`;
    if (this.idsMensajesEnviados.has(claveEnviado)) return;

    // Deduplica si recibimos el mismo mensaje vía broadcast e hidratación
    const claveMsg = `${jugadorId}|${timestamp}|${texto}`;
    if (this.idsMensajesChatVistos.has(claveMsg)) return;
    this.idsMensajesChatVistos.add(claveMsg);

    const li = document.createElement('li');
    li.className = 'mensaje-chat-item';
    if (jugadorId === this.jugadorId) li.classList.add('propio');

    const spanHora = document.createElement('span');
    spanHora.className = 'mensaje-hora';
    const fecha = new Date(timestamp || Date.now());
    spanHora.textContent = fecha.toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const strong = document.createElement('strong');
    strong.className = 'mensaje-autor';
    strong.textContent = `${nombreUsuario}: `;

    const spanTexto = document.createElement('span');
    spanTexto.className = 'mensaje-texto';
    spanTexto.textContent = texto;

    li.appendChild(spanHora);
    li.appendChild(document.createTextNode(' '));
    li.appendChild(strong);
    li.appendChild(spanTexto);

    this.listaMensajes.appendChild(li);
    this.listaMensajes.scrollTop = this.listaMensajes.scrollHeight;
  }

  /**
   * Dibuja en el lobby la lista de jugadores presentes en la sala.
   *
   * @param {string[]} jugadores - Nombres de jugadores a renderizar.
   * @returns {void}
   */
  #pintarJugadores(jugadores) {
    this.lista.innerHTML = jugadores
      .map((j) => {
        const nombre = typeof j === 'string' ? j : j.nombreUsuario;
        const esPropio = typeof j === 'object' && String(j.jugadorId) === String(this.jugadorId);
        return `<li class="jugador-item${esPropio ? ' jugador-propio' : ''}">${nombre}</li>`;
      })
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
    const cartaEnMesa = this.estadoMesaActual.cartaEnMesa || null;

    if (!cartaEnMesa) return true;

    if (this.#esCartaSinColor(carta)) {
      if (penalidad > 0) return carta.tipo === tipoPenalidad;
      return true;
    }

    if (penalidad > 0) return carta.tipo === tipoPenalidad;

    const colorMesa = cartaEnMesa.colorElegido || cartaEnMesa.color;
    const mismoTipoNoNumerico =
      carta.tipo !== 'numero' && cartaEnMesa.tipo !== 'numero' && carta.tipo === cartaEnMesa.tipo;
    const mismoNumero =
      carta.tipo === 'numero' &&
      cartaEnMesa.tipo === 'numero' &&
      carta.numero === cartaEnMesa.numero;

    return carta.color === colorMesa || mismoTipoNoNumerico || mismoNumero;
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

  #obtenerRivalesSegunSentido(jugadores, sentido) {
    const idxActual = jugadores.findIndex((j) => j.jugadorId === this.jugadorId);
    if (idxActual < 0) return [];

    const rivales = [];
    for (let paso = 1; paso < jugadores.length; paso += 1) {
      const idx =
        (((idxActual + sentido * paso) % jugadores.length) + jugadores.length) % jugadores.length;
      rivales.push(jugadores[idx]);
    }

    return rivales;
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
    const rivalesEnOrdenDeTurno = this.#obtenerRivalesSegunSentido(
      estado.jugadores || [],
      estado.sentido || 1
    );
    const esMiTurno = estado.turno === this.jugadorId;
    const juegoActivo = estado.estado === 'jugando';
    const turnoActualId = estado.turno;
    const manoActual = jugadorActual?.mano || [];
    const tieneJugadaDisponible = manoActual.some((carta) => this.#esJugadaValidaEnCliente(carta));
    const debeRobar = juegoActivo && esMiTurno && !tieneJugadaDisponible;
    const claseNombreTurno = (jugador, claseBase) =>
      String(jugador?.jugadorId) === String(turnoActualId)
        ? `${claseBase} jugador-en-turno-nombre`
        : claseBase;

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
    let rivalIzquierda;
    let rivalArriba;
    let rivalDerecha;

    if ((estado.sentido || 1) === -1) {
      rivalDerecha = rivalesEnOrdenDeTurno[0];
      rivalArriba = rivalesEnOrdenDeTurno[1];
      rivalIzquierda = rivalesEnOrdenDeTurno[2];
    } else {
      rivalIzquierda = rivalesEnOrdenDeTurno[0];
      rivalArriba = rivalesEnOrdenDeTurno[1];
      rivalDerecha = rivalesEnOrdenDeTurno[2];
    }

    this.vistaLobby.hidden = true;
    this.vistaMesa.hidden = false;
    this.lobbyPrincipal.classList.add('partida-activa');
    this.info.textContent = '';

    this.vistaMesa.innerHTML = '';

    const areaArriba = document.createElement('div');
    areaArriba.className = 'area-jugador-arriba';

    if (rivalArriba) {
      const nombre = document.createElement('div');
      nombre.className = claseNombreTurno(rivalArriba, 'info-jugador');
      nombre.textContent = textoTurnoJugador(rivalArriba);
      areaArriba.appendChild(nombre);
      areaArriba.appendChild(
        this.#crearManoHorizontal(this.#crearCartasPlaceholder(rivalArriba.cantidadCartas), true)
      );
    }

    const areaRivalesMobile = document.createElement('div');
    areaRivalesMobile.className = 'area-rivales-mobile';
    [rivalIzquierda, rivalArriba, rivalDerecha].forEach((rival) => {
      if (!rival) return;

      const filaRival = document.createElement('div');
      filaRival.className = 'rival-mobile-row';

      const nombreRival = document.createElement('div');
      nombreRival.className = claseNombreTurno(rival, 'info-jugador');
      nombreRival.textContent = textoTurnoJugador(rival);

      const manoRival = this.#crearManoHorizontal(
        this.#crearCartasPlaceholder(rival.cantidadCartas),
        true
      );
      manoRival.classList.add('mano-rival-mobile');

      filaRival.appendChild(nombreRival);
      filaRival.appendChild(manoRival);
      areaRivalesMobile.appendChild(filaRival);
    });

    const zonaCentral = document.createElement('div');
    zonaCentral.className = 'zona-central';

    const lateralIzq = document.createElement('div');
    lateralIzq.className = 'area-jugador-lateral izquierda';
    if (rivalIzquierda) {
      const nombreIzq = document.createElement('div');
      nombreIzq.className = claseNombreTurno(rivalIzquierda, 'nombre-lateral');
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
    if (debeRobar) {
      mazo.classList.add('mazo-destacado');
      mazo.title = 'No tenés una jugada válida. Robá del mazo.';
    }
    mazo.appendChild(this.#crearCarta(null, true));
    if (juegoActivo && esMiTurno) {
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

    const indicadorSentido = document.createElement('div');
    indicadorSentido.className = 'indicador-sentido';
    const esVistaMobile = window.matchMedia(
      '(max-width: 768px), (max-width: 1000px) and (orientation: landscape)'
    ).matches;
    indicadorSentido.textContent = esVistaMobile
      ? estado.sentido === -1
        ? 'Hacia arriba'
        : 'Hacia abajo'
      : estado.sentido === -1
        ? '↺ Antihorario'
        : '↻ Horario';

    const cartasRow = document.createElement('div');
    cartasRow.className = 'cartas-row';
    cartasRow.appendChild(mazo);
    cartasRow.appendChild(descarte);

    const indicadoresRow = document.createElement('div');
    indicadoresRow.className = 'indicadores-row';
    indicadoresRow.appendChild(indicadorColor);
    indicadoresRow.appendChild(indicadorSentido);

    const mazoWrapper = document.createElement('div');
    mazoWrapper.className = 'mazo-wrapper';
    mazoWrapper.appendChild(cartasRow);
    mazoWrapper.appendChild(indicadoresRow);

    tableroCentral.appendChild(mazoWrapper);

    const lateralDer = document.createElement('div');
    lateralDer.className = 'area-jugador-lateral derecha';
    if (rivalDerecha) {
      const nombreDer = document.createElement('div');
      nombreDer.className = claseNombreTurno(rivalDerecha, 'nombre-lateral');
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
      nombreActual.className = claseNombreTurno(jugadorActual, 'info-jugador');
      nombreActual.textContent = textoTurnoJugador(jugadorActual);
      areaAbajo.appendChild(nombreActual);
      areaAbajo.appendChild(
        this.#crearManoHorizontal(manoActual, false, async (carta) => {
          if (!juegoActivo || !esMiTurno) return;
          if (!this.webSocket || this.webSocket.readyState !== WebSocket.OPEN) return;
          if (!this.#esJugadaValidaEnCliente(carta)) {
            this.#mostrarMensaje('Jugada inválida para la carta en mesa', 'error');
            return;
          }

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
    this.vistaMesa.appendChild(areaRivalesMobile);
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
      const response = await fetch(`/api/partidas/${encodeURIComponent(this.partidaId)}`);

      // Si la respuesta no es exitosa, intenta obtener el mensaje de error del cuerpo de la respuesta y mostrarlo.
      // Si no se puede obtener un mensaje específico, muestra un mensaje genérico.
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        this.#mostrarMensaje(data.error || 'No se pudo cargar la partida.', 'error');
        return;
      }

      const sala = await response.json();
      this.esCreador = this.#esCreadorDePartida(sala.creadorId);
      this.maxJugadores = sala.maxJugadores;
      this.titulo.textContent = `Sala de ${sala.jugadores[0] || 'jugador'}`;
      this.#pintarJugadores(sala.jugadores);
      this.#actualizarBotonIniciar(sala.estado);
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
    const url = `${proto}//${window.location.host}/ws?partidaId=${encodeURIComponent(this.partidaId)}`;
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
        if (estado.creadorId != null) {
          this.esCreador = this.#esCreadorDePartida(estado.creadorId);
        }
        this.jugadoresActuales = estado.jugadores || [];
        this.#actualizarEstadoPartida(estado);
        if (estado.estado === 'esperando') {
          this.#actualizarBotonIniciar('esperando');
        } else if (estado.estado === 'jugando') {
          this.#actualizarBotonIniciar('jugando');
          if (!this.partidaIniciadaNotificada) {
            this.#mostrarMensaje('La partida ya empezó.');
            this.partidaIniciadaNotificada = true;
          }
          if (estado.numeroRonda && estado.numeroRonda !== this.numeroRondaActual) {
            const jugadorEnTurno = (estado.jugadores || []).find(
              (jugador) => String(jugador.jugadorId) === String(estado.turno)
            );
            const textoInicioRonda = jugadorEnTurno
              ? `Comienza la ronda ${estado.numeroRonda}. Turno de ${jugadorEnTurno.nombreUsuario}.`
              : `Comienza la ronda ${estado.numeroRonda}.`;
            this.#mostrarMensaje(textoInicioRonda);
            this.numeroRondaActual = estado.numeroRonda;
          }
          this.#renderMesa(estado);
        } else if (estado.estado === 'entre-rondas') {
          this.#actualizarBotonIniciar('entre-rondas');
          this.estadoMesaActual = estado;
          this.#renderMesa(estado);
        }
        this.#pintarJugadores(estado.jugadores || []);
        // Hidratar el historial de chat la primera vez que llega estado-partida
        // (sirve para reconexiones después de un microcorte o F5)
        if (!this.chatHidratado && Array.isArray(estado.mensajesChat)) {
          for (const m of estado.mensajesChat) this.#mostrarMensajeChat(m);
          this.chatHidratado = true;
        }
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
        this.#actualizarBotonIniciar('jugando');
        this.#actualizarEstadoPartida(this.estadoMesaActual);

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
        this.#mostrarModalFinRonda(datos.ganadorRonda, datos.puntajesRonda);
        break;
      }
      case 'partida-terminada': {
        const ganador = (datos.ranking || [])[0];
        this.#mostrarMensaje(`¡${ganador?.nombre || 'Un jugador'} ganó la partida!`);
        const puntajesFinales = {};
        for (const r of datos.ranking || []) {
          puntajesFinales[r.jugadorId] = r.puntaje;
        }
        this.#mostrarTablaPuntajesRonda(puntajesFinales, ganador?.jugadorId);
        this.#mostrarModalFinPartida(datos.ranking || []);
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
      case 'mensaje-chat': {
        this.#mostrarMensajeChat(datos);
        break;
      }
    }
  }
}

export default Partida;

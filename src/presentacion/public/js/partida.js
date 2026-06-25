import { frontLogger as logger } from '/js/logger.js';

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
   * @param {?HTMLElement} [opciones.btnCompartir=null] - Botón flotante para copiar el link de la partida.
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
    btnCompartir = null,
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
    this.btnCompartir = btnCompartir;
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
    this.btnCantarUno = null;
    this.unoProgresoIntervalo = null;
    this.turnoTimerSpan = null;
    this.turnoTimerIntervalo = null;
    this.turnoTimerDeadline = 0;
    this.turnoTimerBeepDisparado = false;
    this.turnoTimerPendienteMs = null;
    this.audioCtx = null;
    this.animacionesActivas = 0;
    this.animacionesPendientes = 0;
    this.colaAnimaciones = Promise.resolve();
    this.estadoPendienteRender = null;
    this.idsManoPropia = new Set();
    this.cartasAnimadasRecientemente = new Set();
    this.ultimaCartaDescarteId = null;
    this.DURACION_ANIMACION_CARTA_MS = 480;
    this.DURACION_ANIMACION_CARTA_MS_REDUCIDA = 220;
    this.RETARDO_ENTRE_CARTAS_MS = 90;
  }

  #asegurarAudioCtx() {
    if (this.audioCtx) {
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
      return this.audioCtx;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    try {
      this.audioCtx = new Ctx();
    } catch {
      this.audioCtx = null;
    }
    return this.audioCtx;
  }

  #tocarTono({ frecuencia, duracion = 0.15, tipo = 'sine', volumen = 0.2, inicio = 0 } = {}) {
    const ctx = this.#asegurarAudioCtx();
    if (!ctx) return;
    try {
      const ahora = ctx.currentTime + Math.max(0, inicio);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = tipo;
      osc.frequency.setValueAtTime(frecuencia, ahora);
      // Attack/release para evitar clicks audibles.
      gain.gain.setValueAtTime(0, ahora);
      gain.gain.linearRampToValueAtTime(volumen, ahora + 0.01);
      gain.gain.linearRampToValueAtTime(0, ahora + duracion);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ahora);
      osc.stop(ahora + duracion + 0.02);
      osc.onended = () => {
        try {
          osc.disconnect();
          gain.disconnect();
        } catch {}
      };
    } catch {}
  }

  #tocarSecuencia(notas = []) {
    notas.forEach((nota) => this.#tocarTono(nota));
  }

  #vibrar(patron) {
    if (!('vibrate' in navigator)) return;
    try {
      navigator.vibrate(patron);
    } catch {}
  }

  /**
   * Inicializa la pantalla configurando UI auxiliar, cargando el resumen de la sala y abriendo el WebSocket.
   *
   * @returns {void}
   */
  async init() {
    this.#configurarBitacoraMobile();
    this.#configurarTabs();
    this.#configurarChat();
    this.#configurarBotonUno();
    this.#configurarTurnoTimer();
    this.#configurarSolapamientoAdaptativo();
    this.#actualizarControlesLobby(undefined);
    const accesoOk = await this.#cargarResumen();
    if (accesoOk) this.#conectarWS();
  }

  /**
   * Recalcula el solapamiento de las manos cuando cambia el tamaño de la mesa
   * (resize, rotación, apertura del panel lateral, etc.).
   *
   * @returns {void}
   */
  #configurarSolapamientoAdaptativo() {
    if (!this.vistaMesa || typeof ResizeObserver === 'undefined') return;
    let pendiente = false;
    const observador = new ResizeObserver(() => {
      if (pendiente) return;
      pendiente = true;
      requestAnimationFrame(() => {
        pendiente = false;
        this.#ajustarSolapamientoManos();
      });
    });
    observador.observe(this.vistaMesa);
    this.observadorSolapamiento = observador;
  }

  #configurarTurnoTimer() {
    const span = document.createElement('span');
    span.className = 'turno-timer';
    span.setAttribute('aria-hidden', 'true');
    this.turnoTimerSpan = span;
  }

  #iniciarTurnoTimer(durationMs) {
    if (!this.turnoTimerSpan) return;
    this.#detenerTurnoTimer(false);
    const total = Math.max(1, Number(durationMs) || 5000);
    this.turnoTimerDeadline = Date.now() + total;
    this.turnoTimerBeepDisparado = false;

    const tick = () => {
      const restanteMs = Math.max(0, this.turnoTimerDeadline - Date.now());
      const segundos = Math.ceil(restanteMs / 1000);
      this.turnoTimerSpan.textContent = `${segundos}s`;
      this.turnoTimerSpan.classList.toggle('turno-timer--urgente', segundos <= 2);

      // Beep + vibración al cruzar el umbral de 2s, sólo si es nuestro turno.
      if (segundos <= 2 && !this.turnoTimerBeepDisparado) {
        this.turnoTimerBeepDisparado = true;
        const esMiTurno =
          this.estadoMesaActual && String(this.estadoMesaActual.turno) === String(this.jugadorId);
        if (esMiTurno) {
          this.#tocarTono({ frecuencia: 880, duracion: 0.12, tipo: 'square', volumen: 0.18 });
          this.#tocarTono({
            frecuencia: 880,
            duracion: 0.12,
            tipo: 'square',
            volumen: 0.18,
            inicio: 0.18,
          });
          this.#vibrar(150);
        }
      }

      if (restanteMs <= 0) {
        clearInterval(this.turnoTimerIntervalo);
        this.turnoTimerIntervalo = null;
        this.turnoTimerSpan.textContent = '';
        this.turnoTimerSpan.classList.remove('turno-timer--urgente');
      }
    };

    tick();
    this.turnoTimerIntervalo = setInterval(tick, 200);
  }

  #aplicarTimerTurnoPendiente(turnoEsperado = null) {
    if (this.turnoTimerPendienteMs == null) return;
    if (!this.estadoMesaActual || this.estadoMesaActual.estado !== 'jugando') return;

    const turno = turnoEsperado ?? this.estadoMesaActual.turno;
    if (turno == null) return;
    if (String(this.estadoMesaActual.turno) !== String(turno)) return;
    if (this.vistaMesa?.hidden) return;

    if (this.turnoTimerSpan) {
      const slot = this.#obtenerSlotTimerTurnoVisible();
      if (!slot) return;
      slot.appendChild(this.turnoTimerSpan);
    }

    const ms = this.turnoTimerPendienteMs;
    this.turnoTimerPendienteMs = null;
    this.#iniciarTurnoTimer(ms);
  }

  #detenerTurnoTimer(quitar = true) {
    if (this.turnoTimerIntervalo) {
      clearInterval(this.turnoTimerIntervalo);
      this.turnoTimerIntervalo = null;
    }
    this.turnoTimerBeepDisparado = false;
    if (!this.turnoTimerSpan) return;
    this.turnoTimerSpan.textContent = '';
    this.turnoTimerSpan.classList.remove('turno-timer--urgente');
    if (quitar) {
      this.turnoTimerPendienteMs = null;
      if (this.turnoTimerSpan.parentNode) {
        this.turnoTimerSpan.parentNode.removeChild(this.turnoTimerSpan);
      }
    }
  }

  #configurarBotonUno() {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.id = 'btn-cantar-uno';
    boton.className = 'btn-cantar-uno';
    boton.setAttribute('aria-label', 'Cantar UNO');
    boton.title = 'Cantar UNO';
    boton.textContent = 'UNO';

    const progreso = document.createElement('span');
    progreso.className = 'btn-cantar-uno-progreso';
    progreso.setAttribute('aria-hidden', 'true');
    boton.appendChild(progreso);

    boton.addEventListener('click', () => {
      if (!this.webSocket || this.webSocket.readyState !== WebSocket.OPEN) return;
      this.#asegurarAudioCtx();
      this.webSocket.send(JSON.stringify({ accion: 'cantar-uno' }));
    });

    this.btnCantarUno = boton;
  }

  #mostrarBotonUno(visible) {
    if (!this.btnCantarUno) return;
    if (!visible) {
      this.#detenerAnimacionUno();
      if (this.btnCantarUno.parentNode) this.btnCantarUno.parentNode.removeChild(this.btnCantarUno);
    }
  }

  #iniciarAnimacionUno(timeoutMs) {
    if (!this.btnCantarUno) return;
    this.btnCantarUno.classList.add('activo');
    this.#detenerAnimacionUno(false);

    const inicio = Date.now();
    const total = Math.max(1, Number(timeoutMs) || 2000);
    const actualizar = () => {
      const transcurrido = Date.now() - inicio;
      const porcentaje = Math.min(100, (transcurrido / total) * 100);
      this.btnCantarUno.style.setProperty('--uno-progreso', `${porcentaje}%`);
      if (porcentaje >= 100) this.#detenerAnimacionUno();
    };
    actualizar();
    this.unoProgresoIntervalo = setInterval(actualizar, 60);
  }

  #detenerAnimacionUno(quitarClase = true) {
    if (this.unoProgresoIntervalo) {
      clearInterval(this.unoProgresoIntervalo);
      this.unoProgresoIntervalo = null;
    }
    if (!this.btnCantarUno) return;
    if (quitarClase) {
      this.btnCantarUno.classList.remove('activo');
      this.btnCantarUno.style.setProperty('--uno-progreso', '0%');
    }
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
    this.#asegurarAudioCtx();
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
      this.#mostrarBotonUno(true);
      return;
    }

    this.#mostrarBotonUno(false);

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
   * Actualiza los controles del lobby según el estado de la partida.
   *
   * @param {string} [estadoPartida] - Estado actual de la partida.
   * @returns {void}
   */
  #actualizarControlesLobby(estadoPartida) {
    const enEspera = estadoPartida === 'esperando';
    this.onCambioVisibilidad(this.esCreador && enEspera);

    if (!this.btnCompartir) return;

    this.btnCompartir.hidden = !enEspera;
    if (enEspera) {
      this.btnCompartir.title = 'Copiar link de la partida';
      this.btnCompartir.setAttribute('aria-label', 'Copiar link de la partida');
    }
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
    if (carta?.id) {
      img.dataset.cartaId = carta.id;
    }
    if (!reverso && typeof onClick === 'function') {
      img.style.cursor = 'pointer';
      img.addEventListener('click', onClick);
    }
    return img;
  }

  #animacionesHabilitadas() {
    return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  #duracionAnimacionCarta() {
    return this.#animacionesHabilitadas()
      ? this.DURACION_ANIMACION_CARTA_MS
      : this.DURACION_ANIMACION_CARTA_MS_REDUCIDA;
  }

  #hayAnimacionesEnCurso() {
    return this.animacionesActivas > 0 || this.animacionesPendientes > 0;
  }

  #notificarAnimacionesListas() {
    if (!this.webSocket || this.webSocket.readyState !== WebSocket.OPEN) return;
    this.webSocket.send(JSON.stringify({ accion: 'animaciones-listas' }));
  }

  #notificarSiAnimacionesLibres() {
    if (this.#hayAnimacionesEnCurso()) return;
    this.#notificarAnimacionesListas();
  }

  #encolarAnimacion(ejecutar) {
    if (!this.#animacionesHabilitadas()) {
      return Promise.resolve()
        .then(() => ejecutar?.())
        .finally(() => {
          this.#notificarSiAnimacionesLibres();
        });
    }

    this.animacionesPendientes += 1;

    const tarea = this.colaAnimaciones.then(async () => {
      this.animacionesActivas += 1;
      try {
        await ejecutar();
      } finally {
        this.animacionesActivas -= 1;
        this.animacionesPendientes -= 1;
        this.#aplicarEstadoPendiente();
        this.#notificarSiAnimacionesLibres();
      }
    });

    this.colaAnimaciones = tarea.catch(() => {});
    return tarea;
  }

  #encolarAnimacionSiLibre(ejecutar) {
    if (!this.#animacionesHabilitadas()) {
      return Promise.resolve();
    }
    if (this.#hayAnimacionesEnCurso()) {
      return Promise.resolve();
    }
    return this.#encolarAnimacion(ejecutar);
  }

  #encolarAccionPostAnimacion(ejecutar) {
    this.colaAnimaciones = this.colaAnimaciones
      .then(() => ejecutar())
      .catch(() => {});
  }

  #solicitarRenderMesa(estado) {
    if (this.#hayAnimacionesEnCurso() && this.#animacionesHabilitadas()) {
      this.estadoPendienteRender = estado;
      this.estadoMesaActual = estado;
      return;
    }
    this.#renderMesa(estado);
  }

  #aplicarEstadoPendiente() {
    if (this.#hayAnimacionesEnCurso() || !this.estadoPendienteRender) return;
    const estado = this.estadoPendienteRender;
    this.estadoPendienteRender = null;
    this.#renderMesa(estado);
  }

  #crearMazoVisual() {
    const carta = this.#crearCarta(null, true);
    carta.classList.add('mazo-carta');
    return carta;
  }

  #reponerCartaMazo(mazo) {
    if (!mazo) return;
    mazo.querySelector('.mazo-carta')?.remove();
    mazo.appendChild(this.#crearMazoVisual());
  }

  #obtenerCartaTopeMazo() {
    return this.vistaMesa?.querySelector('.mazo .mazo-carta');
  }

  #obtenerMazoEl() {
    return this.vistaMesa?.querySelector('.mazo');
  }

  #obtenerDescarteEl() {
    return this.vistaMesa?.querySelector('.carta-descarte');
  }

  #etiquetarMano(mano, jugadorId) {
    if (mano && jugadorId != null) {
      mano.dataset.jugadorId = String(jugadorId);
    }
    return mano;
  }

  /**
   * Recalcula el solapamiento de todas las manos visibles para que, sin importar
   * la cantidad de cartas, la mano completa entre siempre en el espacio disponible.
   *
   * @returns {void}
   */
  #ajustarSolapamientoManos() {
    if (!this.vistaMesa || this.vistaMesa.hidden) return;
    const manos = this.vistaMesa.querySelectorAll('.mano-horizontal, .mano-lateral');
    manos.forEach((mano) => this.#ajustarSolapamientoMano(mano));
  }

  /**
   * Ajusta el solapamiento (`--sep-carta`) de una mano puntual.
   *
   * Patrón de "abanico adaptativo": el solapamiento por defecto (definido en CSS)
   * solo se sobreescribe cuando las cartas desbordan el contenedor; en ese caso se
   * calcula el solapamiento mínimo que hace que las N cartas entren en el espacio
   * disponible, dejando siempre una porción visible de cada carta.
   *
   * @param {HTMLElement} mano - Contenedor de la mano (`.mano-horizontal` o `.mano-lateral`).
   * @returns {void}
   */
  #ajustarSolapamientoMano(mano) {
    if (!mano) return;

    // Partimos del solapamiento de diseño para medir el desborde real.
    mano.style.removeProperty('--sep-carta');

    const cartas = mano.children;
    const cantidad = cartas.length;
    if (cantidad <= 1) return;

    const primera = cartas[0];
    const ultima = cartas[cantidad - 1];
    const esLateral = mano.classList.contains('mano-lateral');

    // El espacio disponible se mide sobre un ancestro estable (no sobre la mano,
    // cuyo ancho puede crecer con el contenido por ser un contenedor shrink-to-fit).
    const contenedor = esLateral
      ? mano.closest('.zona-central') || mano.parentElement
      : mano.closest('.mesa') || mano.parentElement;
    if (!contenedor) return;

    const tamCarta = esLateral ? primera.offsetHeight : primera.offsetWidth;
    const disponible = esLateral ? contenedor.clientHeight : contenedor.clientWidth;

    // Extensión real del abanico, deducida de la posición de la última carta.
    const contenido = esLateral
      ? ultima.offsetTop + ultima.offsetHeight - primera.offsetTop
      : ultima.offsetLeft + ultima.offsetWidth - primera.offsetLeft;

    if (!tamCarta || disponible <= 0) return;

    // Si con el solapamiento por defecto ya entran, no tocamos nada.
    if (contenido <= disponible + 1) return;

    // Avance máximo por carta para que las N entren: tamCarta + (n-1)*avance <= disponible.
    const avanceMax = (disponible - tamCarta) / (cantidad - 1);
    const solapamientoNecesario = tamCarta - avanceMax;

    // Nunca tapamos la carta por completo: dejamos al menos una porción visible.
    const solapamientoMaximo = tamCarta - Math.max(10, tamCarta * 0.16);
    const solapamiento = Math.min(solapamientoMaximo, Math.max(0, solapamientoNecesario));

    mano.style.setProperty('--sep-carta', `${solapamiento}px`);
  }

  #obtenerSlotTimerTurnoVisible() {
    const nombresEnTurno = this.vistaMesa?.querySelectorAll('.jugador-en-turno-nombre');
    if (!nombresEnTurno?.length) return null;

    for (const nombre of nombresEnTurno) {
      const rect = nombre.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        return nombre.querySelector('.turno-timer-slot');
      }
    }

    return null;
  }

  #obtenerZonaMano(jugadorId) {
    if (!this.vistaMesa || this.vistaMesa.hidden || jugadorId == null) return null;

    const manos = this.vistaMesa.querySelectorAll(`[data-jugador-id="${String(jugadorId)}"]`);
    for (const mano of manos) {
      const rect = mano.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) return mano;
    }

    return manos[0] || null;
  }

  #obtenerUltimaCartaEnMano(jugadorId) {
    const mano = this.#obtenerZonaMano(jugadorId);
    if (!mano) return null;

    const cartas = mano.querySelectorAll('.carta-svg');
    return cartas.length > 0 ? cartas[cartas.length - 1] : mano;
  }

  #obtenerCartaOrigenDescarte(jugadorId, carta) {
    if (String(jugadorId) === String(this.jugadorId) && carta?.id) {
      const cartaPropia = this.vistaMesa?.querySelector(
        `.area-jugador-abajo .carta-svg[data-carta-id="${carta.id}"]`
      );
      if (cartaPropia) return cartaPropia;
    }

    return this.#obtenerUltimaCartaEnMano(jugadorId);
  }

  #obtenerRectDestinoMano(manoEl) {
    const cartas = manoEl.querySelectorAll('.carta-svg');
    if (cartas.length === 0) {
      return this.#obtenerRectCarta(manoEl);
    }

    const ultima = cartas[cartas.length - 1].getBoundingClientRect();
    const esLateral = manoEl.classList.contains('mano-lateral');

    if (esLateral) {
      return {
        left: ultima.left,
        top: ultima.top + ultima.height * 0.35,
        width: ultima.width,
        height: ultima.height,
      };
    }

    return {
      left: ultima.left + ultima.width * 0.55,
      top: ultima.top,
      width: ultima.width,
      height: ultima.height,
    };
  }

  #obtenerRectCarta(el) {
    if (!el) return null;
    const carta = el.classList?.contains('carta-svg') ? el : el.querySelector('.carta-svg');
    return (carta || el).getBoundingClientRect();
  }

  #animarCartaVolando(origenEl, destinoEl, carta, { reverso = false, desdeMazo = false } = {}) {
    if (!origenEl || !destinoEl || !this.#animacionesHabilitadas()) {
      return Promise.resolve();
    }

    const origen = this.#obtenerRectCarta(origenEl);
    const destino = destinoEl.dataset?.jugadorId
      ? this.#obtenerRectDestinoMano(destinoEl)
      : this.#obtenerRectCarta(
          destinoEl.querySelector?.('.carta-svg:last-child') ||
            destinoEl.querySelector?.('.carta-svg') ||
            destinoEl
        );
    if (!origen?.width || !destino?.width) return Promise.resolve();

    const voladora = this.#crearCarta(carta, reverso);
    voladora.classList.add('carta-voladora');
    voladora.style.width = `${origen.width}px`;
    voladora.style.height = `${origen.height}px`;
    voladora.style.left = `${origen.left}px`;
    voladora.style.top = `${origen.top}px`;

    const deltaX = destino.left - origen.left;
    const deltaY = destino.top - origen.top;

    voladora.style.setProperty('--carta-vuelo-duracion', `${this.#duracionAnimacionCarta()}ms`);

    const opacidadOrigen = origenEl.style.opacity;
    const cartaOrigen = origenEl.classList?.contains('carta-svg')
      ? origenEl
      : origenEl.querySelector?.('.carta-svg');

    if (desdeMazo) {
      const mazo = origenEl.closest('.mazo');
      origenEl.remove();
      if (mazo) this.#reponerCartaMazo(mazo);
    } else if (cartaOrigen) {
      cartaOrigen.style.opacity = '0';
    }

    document.body.appendChild(voladora);

    return new Promise((resolve) => {
      const limpiar = () => {
        voladora.remove();
        if (!desdeMazo && cartaOrigen) {
          cartaOrigen.style.opacity = opacidadOrigen;
        }
        resolve();
      };

      const onFin = (evento) => {
        if (evento.propertyName !== 'transform') return;
        voladora.removeEventListener('transitionend', onFin);
        limpiar();
      };

      voladora.addEventListener('transitionend', onFin);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          voladora.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
        });
      });

      setTimeout(limpiar, this.#duracionAnimacionCarta() + 120);
    });
  }

  async #animarCartaADescarte(jugadorId, carta) {
    const descarte = this.#obtenerDescarteEl();
    const origen = this.#obtenerCartaOrigenDescarte(jugadorId, carta);
    if (!descarte || !origen) return;

    await this.#animarCartaVolando(origen, descarte, carta, { reverso: false });
  }

  async #animarCartasDesdeMazo(jugadorId, cartas = [], cantidadSinDetalle = 0) {
    const mano = this.#obtenerZonaMano(jugadorId);
    if (!mano) return;

    const cantidad = cartas.length || cantidadSinDetalle;
    if (!cantidad) return;

    const esYo = String(jugadorId) === String(this.jugadorId);

    for (let i = 0; i < cantidad; i += 1) {
      const carta = cartas[i] || null;
      const cartaTope = this.#obtenerCartaTopeMazo();
      if (!cartaTope) return;

      if (carta?.id) {
        this.cartasAnimadasRecientemente.add(carta.id);
      }

      await this.#animarCartaVolando(cartaTope, mano, carta, {
        reverso: !esYo || !carta,
        desdeMazo: true,
      });

      this.#agregarCartaVisibleAMano(jugadorId, carta);

      if (i < cantidad - 1) {
        await new Promise((resolve) => {
          setTimeout(resolve, this.RETARDO_ENTRE_CARTAS_MS);
        });
      }
    }
  }

  /**
   * Genera una mano horizontal para jugadores de arriba o abajo.
   *
   * @param {Object[]} cartas - Cartas a renderizar.
   * @param {boolean} [reverso=false] - Indica si las cartas se muestran ocultas.
   * @param {?Function} [onCartaClick=null] - Callback para clicks sobre cartas visibles.
   * @returns {HTMLDivElement} Contenedor de la mano horizontal.
   */
  #crearManoHorizontal(cartas, reverso = false, onCartaClick = null, cartasNuevas = null) {
    const mano = document.createElement('div');
    mano.className = 'mano-horizontal';
    cartas.forEach((carta) => {
      const clickHandler = !reverso && carta?.id ? () => onCartaClick?.(carta) : null;
      const cartaEl = this.#crearCarta(carta, reverso, clickHandler);
      if (carta?.id && cartasNuevas?.has(carta.id) && !this.cartasAnimadasRecientemente.has(carta.id)) {
        cartaEl.classList.add('carta-nueva');
      }
      mano.appendChild(cartaEl);
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

  async #manejarJugarCartaPropia(carta) {
    const estado = this.estadoMesaActual;
    if (!estado || estado.estado !== 'jugando') return;
    if (String(estado.turno) !== String(this.jugadorId)) return;
    if (!this.webSocket || this.webSocket.readyState !== WebSocket.OPEN) return;
    this.#asegurarAudioCtx();
    if (!this.#esJugadaValidaEnCliente(carta)) {
      this.#mostrarMensaje('Jugada inválida para la carta en mesa', 'error');
      return;
    }

    const payload = { accion: 'jugar-carta', cartaId: carta.id };
    if (this.#esCartaSinColor(carta)) {
      const colorElegido = await this.#pedirColorComodin();
      if (!colorElegido) return;
      payload.colorElegido = colorElegido;
    }

    this.webSocket.send(JSON.stringify(payload));
  }

  #incorporarCartaRobadaEnEstado(jugadorId, carta = null) {
    if (!this.estadoMesaActual?.jugadores) return;

    const jugador = this.estadoMesaActual.jugadores.find(
      (j) => String(j.jugadorId) === String(jugadorId)
    );
    if (!jugador) return;

    if (String(jugadorId) === String(this.jugadorId) && carta?.id) {
      if (!Array.isArray(jugador.mano)) jugador.mano = [];
      if (!jugador.mano.some((c) => c.id === carta.id)) {
        jugador.mano.push(carta);
        this.idsManoPropia.add(carta.id);
      }
      return;
    }

    jugador.cantidadCartas = (jugador.cantidadCartas || 0) + 1;
  }

  #agregarCartaVisibleAMano(jugadorId, carta = null) {
    const mano = this.#obtenerZonaMano(jugadorId);
    if (!mano) return;

    const esYo = String(jugadorId) === String(this.jugadorId);

    if (esYo && carta?.id) {
      if (mano.querySelector(`[data-carta-id="${carta.id}"]`)) return;
      const cartaEl = this.#crearCarta(carta, false, () => this.#manejarJugarCartaPropia(carta));
      cartaEl.classList.add('carta-nueva');
      mano.appendChild(cartaEl);
      this.#incorporarCartaRobadaEnEstado(jugadorId, carta);
      return;
    }

    const cartaEl = this.#crearCarta(null, true);
    cartaEl.classList.add('carta-nueva');
    mano.appendChild(cartaEl);
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
    const juegoActivo = estado.estado === 'jugando';
    const turnoActualId = estado.turno;
    const manoActual = jugadorActual?.mano || [];
    const idsManoAnteriores = this.idsManoPropia;
    const idsCartasNuevas = new Set(
      idsManoAnteriores.size > 0
        ? manoActual.map((carta) => carta.id).filter((id) => id && !idsManoAnteriores.has(id))
        : []
    );
    this.idsManoPropia = new Set(manoActual.map((carta) => carta.id).filter(Boolean));
    const tieneJugadaDisponible = manoActual.some((carta) => this.#esJugadaValidaEnCliente(carta));
    const debeRobar = juegoActivo && esMiTurno && !tieneJugadaDisponible;
    const claseNombreTurno = (jugador, claseBase) =>
      String(jugador?.jugadorId) === String(turnoActualId)
        ? `${claseBase} jugador-en-turno-nombre`
        : claseBase;

    const crearEtiquetaNombreJugador = (jugador, claseBase) => {
      const etiqueta = document.createElement('div');
      etiqueta.className = claseNombreTurno(jugador, claseBase);

      const texto = document.createElement('span');
      texto.className = 'jugador-nombre-texto';
      texto.textContent = jugador.nombreUsuario;
      etiqueta.appendChild(texto);

      if (juegoActivo) {
        const enTurno = String(jugador.jugadorId) === String(turnoActualId);
        const esYo = String(jugador.jugadorId) === String(this.jugadorId);

        const sufijo = document.createElement('span');
        sufijo.className = 'jugador-nombre-sufijo-turno';
        sufijo.textContent = esYo ? ' (tu turno)' : ' (en turno)';
        if (!enTurno) sufijo.classList.add('jugador-nombre-turno-inactivo');
        etiqueta.appendChild(sufijo);

        const timerSlot = document.createElement('span');
        timerSlot.className = 'turno-timer-slot';
        if (!enTurno) timerSlot.classList.add('turno-timer-slot--inactivo');
        etiqueta.appendChild(timerSlot);
      }

      return etiqueta;
    };

    // Las posiciones de los rivales se mantienen fijas según el orden de asiento,
    // independientemente del sentido de juego. El indicador de sentido se encarga
    // de comunicar la dirección actual (como en el UNO con jugadores sentados).
    const rivalIzquierda = rivales[0];
    const rivalArriba = rivales[1];
    const rivalDerecha = rivales[2];

    this.vistaLobby.hidden = true;
    this.vistaMesa.hidden = false;
    this.vistaMesa.classList.toggle('juego-activo', juegoActivo);
    this.lobbyPrincipal.classList.add('partida-activa');
    this.info.textContent = '';

    this.vistaMesa.innerHTML = '';

    const usaRivalesEnListaMobile = window.matchMedia('(max-width: 1000px)').matches;

    const areaArriba = document.createElement('div');
    areaArriba.className = 'area-jugador-arriba';

    if (rivalArriba && !usaRivalesEnListaMobile) {
      areaArriba.appendChild(crearEtiquetaNombreJugador(rivalArriba, 'info-jugador'));
      areaArriba.appendChild(
        this.#etiquetarMano(
          this.#crearManoHorizontal(this.#crearCartasPlaceholder(rivalArriba.cantidadCartas), true),
          rivalArriba.jugadorId
        )
      );
    }

    const areaRivalesMobile = document.createElement('div');
    areaRivalesMobile.className = 'area-rivales-mobile';
    [rivalIzquierda, rivalArriba, rivalDerecha].forEach((rival) => {
      if (!rival) return;

      const filaRival = document.createElement('div');
      filaRival.className = 'rival-mobile-row';

      filaRival.appendChild(crearEtiquetaNombreJugador(rival, 'info-jugador'));

      const manoRival = this.#etiquetarMano(
        this.#crearManoHorizontal(
          this.#crearCartasPlaceholder(rival.cantidadCartas),
          true
        ),
        rival.jugadorId
      );
      manoRival.classList.add('mano-rival-mobile');

      filaRival.appendChild(manoRival);
      areaRivalesMobile.appendChild(filaRival);
    });

    const zonaCentral = document.createElement('div');
    zonaCentral.className = 'zona-central';

    const lateralIzq = document.createElement('div');
    lateralIzq.className = 'area-jugador-lateral izquierda';
    if (rivalIzquierda) {
      lateralIzq.appendChild(crearEtiquetaNombreJugador(rivalIzquierda, 'nombre-lateral'));
      lateralIzq.appendChild(
        this.#etiquetarMano(
          this.#crearManoLateral(this.#crearCartasPlaceholder(rivalIzquierda.cantidadCartas), true),
          rivalIzquierda.jugadorId
        )
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
    mazo.appendChild(this.#crearMazoVisual());
    if (juegoActivo && esMiTurno) {
      mazo.style.cursor = 'pointer';
      mazo.addEventListener('click', () => {
        if (!this.webSocket || this.webSocket.readyState !== WebSocket.OPEN) return;
        this.#asegurarAudioCtx();
        this.webSocket.send(JSON.stringify({ accion: 'robar-carta' }));
      });
    }

    const descarte = document.createElement('div');
    descarte.className = 'carta-descarte';
    const descarteVisible = estado.descarte || [];
    const ultimaCarta = descarteVisible[descarteVisible.length - 1] || estado.cartaEnMesa || null;
    if (ultimaCarta?.id && ultimaCarta.id !== this.ultimaCartaDescarteId) {
      descarte.classList.add('carta-descarte-actualizada');
    }
    this.ultimaCartaDescarteId = ultimaCarta?.id ?? null;
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
      lateralDer.appendChild(crearEtiquetaNombreJugador(rivalDerecha, 'nombre-lateral'));
      lateralDer.appendChild(
        this.#etiquetarMano(
          this.#crearManoLateral(this.#crearCartasPlaceholder(rivalDerecha.cantidadCartas), true),
          rivalDerecha.jugadorId
        )
      );
    }

    zonaCentral.appendChild(lateralIzq);
    zonaCentral.appendChild(tableroCentral);
    zonaCentral.appendChild(lateralDer);

    const areaAbajo = document.createElement('div');
    areaAbajo.className = 'area-jugador-abajo';

    if (jugadorActual) {
      const headerActual = document.createElement('div');
      headerActual.className = 'jugador-actual-header';

      headerActual.appendChild(crearEtiquetaNombreJugador(jugadorActual, 'info-jugador'));

      if (juegoActivo && this.btnCantarUno) headerActual.appendChild(this.btnCantarUno);

      areaAbajo.appendChild(headerActual);
      areaAbajo.appendChild(
        this.#etiquetarMano(
          this.#crearManoHorizontal(
            manoActual,
            false,
            (carta) => this.#manejarJugarCartaPropia(carta),
            idsCartasNuevas
          ),
          jugadorActual.jugadorId
        )
      );
    }

    this.vistaMesa.appendChild(areaArriba);
    this.vistaMesa.appendChild(areaRivalesMobile);
    this.vistaMesa.appendChild(zonaCentral);
    this.vistaMesa.appendChild(areaAbajo);

    if (juegoActivo && this.turnoTimerSpan) {
      const slot = this.#obtenerSlotTimerTurnoVisible();
      if (slot && !slot.contains(this.turnoTimerSpan)) {
        slot.appendChild(this.turnoTimerSpan);
      }
    }
    this.#aplicarTimerTurnoPendiente();
    this.cartasAnimadasRecientemente.clear();

    // El solapamiento adaptativo se calcula tras el layout para que la mano
    // entre completa en pantalla por más cartas que tenga.
    requestAnimationFrame(() => this.#ajustarSolapamientoManos());
  }

  /**
   * Obtiene el resumen actual de la sala por HTTP y actualiza el lobby con esa información.
   *
   * @returns {Promise<void>}
   */
  async #cargarResumen() {
    if (!this.partidaId) {
      this.#mostrarMensaje('Falta el ID de partida.', 'error');
      return false;
    }

    try {
      const response = await fetch(`/api/partidas/${encodeURIComponent(this.partidaId)}`);

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const mensaje = data.error || 'No se pudo cargar la partida.';

        if (response.status === 403 || response.status === 404) {
          window.__navInterno = true;
          window.location.href = `/public/salas?error=${encodeURIComponent(mensaje)}`;
          return false;
        }

        this.#mostrarMensaje(mensaje, 'error');
        return false;
      }

      const sala = await response.json();
      this.esCreador = this.#esCreadorDePartida(sala.creadorId);
      this.maxJugadores = sala.maxJugadores;
      this.titulo.textContent = `Sala de ${sala.jugadores[0] || 'jugador'}`;
      this.#pintarJugadores(sala.jugadores);
      this.#actualizarControlesLobby(sala.estado);
      return true;
    } catch (err) {
      logger.error('Error al cargar resumen de partida', {
        error: err,
        partidaId: this.partidaId,
        jugadorId: this.jugadorId,
      });
      this.#mostrarMensaje('Error de red al cargar la partida.', 'error');
      return false;
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
        this.#actualizarControlesLobby(estado.estado);
        if (estado.estado === 'jugando') {
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
          this.#solicitarRenderMesa(estado);
        } else if (estado.estado === 'entre-rondas') {
          this.estadoMesaActual = estado;
          this.#solicitarRenderMesa(estado);
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
        this.#encolarAnimacionSiLibre(() =>
          this.#animarCartaADescarte(datos.jugadorId, datos.carta)
        );
        break;
      }
      case 'cartas-robadas': {
        this.#encolarAnimacion(() =>
          this.#animarCartasDesdeMazo(this.jugadorId, datos.cartasRobadas || [])
        );
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
        this.#actualizarControlesLobby('jugando');
        this.#actualizarEstadoPartida(this.estadoMesaActual);

        const robo = datos['robó'] || datos.robo;
        if (robo && robo.jugadorId != null) {
          const nombre = this.#nombreJugador(robo.jugadorId);
          const cantidad = Number(robo.cantidad) || 0;
          const palabraCarta = cantidad === 1 ? 'carta' : 'cartas';
          const sufijo = robo.auto ? ' (se le acabó el tiempo)' : '';
          this.#mostrarMensaje(`${nombre} robó ${cantidad} ${palabraCarta}${sufijo}.`);

          if (String(robo.jugadorId) !== String(this.jugadorId) && cantidad > 0) {
            this.#encolarAnimacionSiLibre(() =>
              this.#animarCartasDesdeMazo(robo.jugadorId, [], cantidad)
            );
          }
        }

        if (datos.turno != null) {
          this.#detenerTurnoTimer(false);
          this.turnoTimerPendienteMs = datos.tiempoTurnoMs || 10000;
          this.#aplicarTimerTurnoPendiente(datos.turno);
        } else {
          this.#detenerTurnoTimer();
        }

        break;
      }
      case 'ronda-terminada': {
        this.#detenerTurnoTimer();
        this.#tocarSecuencia([
          { frecuencia: 523.25, duracion: 0.18, tipo: 'triangle', volumen: 0.22 },
          { frecuencia: 659.25, duracion: 0.18, tipo: 'triangle', volumen: 0.22, inicio: 0.16 },
          { frecuencia: 783.99, duracion: 0.32, tipo: 'triangle', volumen: 0.22, inicio: 0.32 },
        ]);
        this.#vibrar([100, 50, 100]);
        this.#mostrarMensaje('Ronda terminada.');
        this.#mostrarTablaPuntajesRonda(datos.puntajesRonda || {}, datos.ganadorRonda);
        this.#encolarAccionPostAnimacion(() => {
          this.#mostrarModalFinRonda(datos.ganadorRonda, datos.puntajesRonda);
        });
        break;
      }
      case 'partida-terminada': {
        this.#detenerTurnoTimer();
        this.#tocarSecuencia([
          { frecuencia: 523.25, duracion: 0.18, tipo: 'triangle', volumen: 0.25 },
          { frecuencia: 659.25, duracion: 0.18, tipo: 'triangle', volumen: 0.25, inicio: 0.18 },
          { frecuencia: 783.99, duracion: 0.18, tipo: 'triangle', volumen: 0.25, inicio: 0.36 },
          { frecuencia: 1046.5, duracion: 0.5, tipo: 'triangle', volumen: 0.28, inicio: 0.54 },
        ]);
        this.#vibrar([120, 60, 120, 60, 250]);
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
      case 'uno-pendiente': {
        const nombre = this.#nombreJugador(datos.jugadorEnUno);
        this.#mostrarMensaje(`${nombre} tiene una sola carta. ¡Cantá UNO!`);
        this.#iniciarAnimacionUno(datos.timeoutMs || 2000);
        break;
      }
      case 'uno-cantado': {
        const nombreEnUno = this.#nombreJugador(datos.jugadorEnUno);
        if (datos.auto) {
          this.#mostrarMensaje(`${nombreEnUno} cantó UNO.`);
        } else if (String(datos.cantadoPor) === String(datos.jugadorEnUno)) {
          this.#mostrarMensaje(`${nombreEnUno} cantó UNO a tiempo.`);
        } else {
          const cantador = this.#nombreJugador(datos.cantadoPor);
          this.#mostrarMensaje(`${cantador} cantó UNO por ${nombreEnUno}.`);
        }
        this.#detenerAnimacionUno();
        break;
      }
      case 'uno-penalizado': {
        const nombreEnUno = this.#nombreJugador(datos.jugadorEnUno);
        const cantidad = Number(datos.cantidad) || 2;
        const cartas = cantidad === 1 ? 'carta' : 'cartas';
        const por = datos.atrapadoPor === 'bot' ? 'un bot' : this.#nombreJugador(datos.atrapadoPor);
        this.#mostrarMensaje(
          `${nombreEnUno} no cantó UNO. ${por} lo atrapó: +${cantidad} ${cartas}.`,
          'error'
        );
        this.#detenerAnimacionUno();
        break;
      }
      case 'uno-vencido': {
        this.#detenerAnimacionUno();
        break;
      }
      case 'uno-falso': {
        const nombre = this.#nombreJugador(datos.jugadorId);
        this.#mostrarMensaje(`¡${nombre} ES PENALIZADO POR TOCAR UNO!!`, 'error');
        break;
      }
    }
  }
}

export default Partida;

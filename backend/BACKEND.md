# UNO Argentino — Documentación del Backend

## Stack

- **Node.js** + **Express** (API REST)
- **ws** (WebSocket, mismo puerto que HTTP)
- **@google/generative-ai** (Gemini 1.5 Flash para bots con IA)
- **mysql2** (persistencia de jugadores e historial de partidas)
- Partidas activas en memoria; jugadores e historial en MySQL

## Estructura

```
backend/
├── server.js                          # Clase Servidor (Express + WebSocket)
└── src/
    ├── rutas/
    │   ├── AuthController.js          # Registro e ingreso de jugadores
    │   ├── PartidasController.js      # CRUD de partidas
    │   └── PuntajesController.js      # Tabla global de puntajes
    ├── ws/
    │   └── manejadorPartida.js        # Conexiones WebSocket y acciones de juego
    ├── db/
    │   ├── Persistencia.js            # Singleton: elige repositorio según DB_HOST; partidas activas en memoria
    │   ├── mysql.js                   # Connection pool (mysql2)
    │   ├── init.sql                   # Schema: jugadores, partidas, partida_jugadores
    │   └── repositorios/
    │       ├── JugadorRepositorioMemoria.js  # Implementación en memoria (sin DB_HOST)
    │       └── JugadorRepositorioMySQL.js    # Implementación MySQL (con DB_HOST)
    └── juego/
        ├── Carta.js                   # Modelo de carta (valor, validación de jugada)
        ├── Jugador.js                 # Jugador registrado (id, nombre)
        ├── JugadorEnSala.js           # Jugador dentro de una partida (mano, UNO)
        ├── Mazo.js                    # Mazo de cartas (crear, mezclar, robar)
        ├── SalaDeJuego.js             # Lógica de la partida (turnos, rondas)
        └── BotLLM.js                  # Bot con IA (Gemini 1.5 Flash)
```

---

## API REST

Base URL: `http://localhost:3000`

### Autenticación

| Método | Ruta | Body | Respuesta |
|--------|------|------|-----------|
| POST | `/api/registrarse` | `{ nombreUsuario }` | `{ jugadorId, nombreUsuario }` |
| POST | `/api/ingresar` | `{ nombreUsuario }` | `{ jugadorId, nombreUsuario }` |

> No hay contraseña por ahora. El `jugadorId` (UUID) es el identificador de sesión.

### Partidas

| Método | Ruta | Body | Respuesta |
|--------|------|------|-----------|
| GET | `/api/partidas` | — | Lista de salas en estado `esperando` |
| POST | `/api/partidas` | `{ jugadorId, maxJugadores?, cantidadBots? }` | `{ partidaId, ... }` |
| GET | `/api/partidas/:id` | — | Resumen público de la sala |

- `maxJugadores`: entre 2 y 4 (opcional, por defecto se calcula como `1 + cantidadBots`)
- `cantidadBots`: entre 0 y 3. El total humanos + bots debe ser entre 2 y 4.

Ejemplo — 1 jugador vs 2 bots:
```json
{ "jugadorId": "...", "cantidadBots": 2 }
```

### Puntajes

| Método | Ruta | Respuesta |
|--------|------|-----------|
| GET | `/api/puntajes` | Lista ordenada por puntaje global `[{ nombreUsuario, puntajeGlobal }]` |

---

## WebSocket

Conexión: `ws://localhost:3000?jugadorId=X&partidaId=Y`

Al conectarse, el servidor une al jugador a la sala (si hay lugar) y envía el estado actual.

### Eventos: Cliente → Servidor

Todos los mensajes son JSON con el campo `accion`.

| Acción | Payload extra | Descripción |
|--------|--------------|-------------|
| `iniciar-partida` | — | El creador inicia la partida (mínimo 2 jugadores) |
| `jugar-carta` | `{ cartaId, colorElegido? }` | Jugar una carta de la mano. `colorElegido` requerido para comodines |
| `robar-carta` | — | Robar del mazo (o absorber la penalidad acumulada) |
| `cantar-uno` | — | Declarar UNO (debe hacerse cuando quedan 2 cartas en mano) |
| `denunciar-uno` | `{ acusadoId }` | Denunciar que un jugador no cantó UNO |

Ejemplo:
```json
{ "accion": "jugar-carta", "cartaId": "uuid-de-la-carta", "colorElegido": "rojo" }
```

### Eventos: Servidor → Cliente

| Evento | Datos | Descripción |
|--------|-------|-------------|
| `estado-partida` | `{ estado }` | Estado completo (mano propia, cantidad de cartas rivales, turno, carta en mesa, puntajes) |
| `jugador-unido` | `{ jugadorId, nombreUsuario, totalJugadores }` | Un jugador entró a la sala |
| `turno-cambiado` | `{ turno, sentido, penalidad?, robó? }` | Cambió el turno |
| `carta-jugada` | `{ jugadorId, carta }` | Alguien jugó una carta |
| `cartas-robadas` | `{ cartasRobadas }` | Las cartas que robaste vos (solo te llega a vos) |
| `uno-cantado` | `{ jugadorId, nombreUsuario }` | Un jugador cantó UNO |
| `uno-denunciado` | `{ denuncianteId, acusado }` | Se denunció un UNO no cantado |
| `ronda-terminada` | `{ ganadorRonda, puntosGanados, puntajesRonda }` | Terminó una ronda |
| `partida-terminada` | `{ ranking }` | Alguien llegó a 500 pts. Ranking con deltas de puntaje global |
| `jugador-abandono` | `{ jugadorId, nombreUsuario, mensaje }` | Un jugador se desconectó, partida cancelada |
| `error` | `{ mensaje }` | Jugada inválida u otro error |

---

## Mazo UNO Argentino

| Carta | Cantidad | Valor (puntaje) |
|-------|----------|----------------|
| 0 por color | 4 | 0 |
| 1–9 por color (x2) | 72 | valor nominal |
| Roba Dos por color (x2) | 8 | 20 |
| Reversa por color (x2) | 8 | 20 |
| Salta por color (x2) | 8 | 20 |
| Comodín | 4 | 50 |
| Comodín Roba Cuatro | 4 | 50 |
| Comodín Roba Tres | 4 | 50 |
| **Total** | **112** | |

---

## Reglas implementadas

- **Jugada válida**: misma carta, mismo color, o comodín
- **Comodines**: se juegan sobre cualquier carta; el jugador elige el color nuevo
- **Acumulación de penalidad**: +2, +3 y +4 se apilan si el siguiente jugador tiene una del mismo tipo. Si no tiene, roba todo el acumulado
- **UNO**: debe cantarse después de jugar la anteúltima carta, cuando queda **1 carta** en mano. Si otro jugador lo denuncia antes de que lo cante, el infractor roba 2
- **Reversa con 2 jugadores**: actúa como Salta
- **Fin de ronda**: el primero en quedarse sin cartas suma los puntos de las cartas restantes de los rivales
- **Fin de partida**: el primero en llegar a **500 puntos** gana
- **Abandono**: la partida se cancela; no se persiste resultado en base de datos

## Sistema de puntaje

### Puntaje de ronda

Cuando un jugador se queda sin cartas, gana la ronda y suma al acumulado (`puntajesRonda`) el **valor de las cartas que les quedan en mano a los demás**. Los valores son:

| Carta | Valor |
|-------|-------|
| Números (0–9) | valor nominal |
| Salta / Reversa / Roba-dos | 20 |
| Comodines (roba-cuatro, roba-tres, cambia-color) | 50 |

Ejemplo: si los rivales tienen `7 + Reversa + Comodín` en mano → el ganador suma `7 + 20 + 50 = 77` puntos.

La partida continúa ronda a ronda hasta que un jugador acumula **500 puntos** en `puntajesRonda`.

### Puntaje global al terminar la partida

El ranking final se arma ordenando por `puntajesRonda` de mayor a menor. El `puntajeGlobal` de cada jugador no se almacena como columna; se calcula como `SUM(delta_global)` sobre `partida_jugadores`.

| Posición | Delta |
|----------|-------|
| 1° (ganador) | +50 |
| 2° | 0 |
| 3° | −25 |
| 4° | −50 |

---

## Bots con IA (Gemini)

Al crear una partida con `cantidadBots > 0`, se agregan jugadores bot a la sala. Cuando les toca el turno, el servidor llama a la API de **Gemini 1.5 Flash** con el estado del juego y ejecuta la jugada devuelta.

### Configuración

Requiere un archivo `.env` en `/backend` con la API key:
```
GEMINI_API_KEY=tu_api_key
```

Las variables de base de datos y puerto están definidas en `docker-compose.yml`. Si corrés sin Docker, agregá al `.env`:
```
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_USER=uno
DB_PASSWORD=uno
DB_NAME=uno
```

Obtené tu API key gratis en [aistudio.google.com](https://aistudio.google.com).

### Comportamiento

1. El bot recibe su mano, la carta en mesa, la penalidad acumulada y la cantidad de cartas de los rivales
2. Gemini elige qué carta jugar (o si robar) y devuelve un JSON `{ cartaId, colorElegido }`
3. El servidor valida que la jugada sea legal antes de ejecutarla
4. Si la API falla o la respuesta es inválida → **fallback**: se juega una carta de acción aleatoria válida (o número si no hay acciones)
5. El bot canta UNO automáticamente cuando le quedan 2 cartas
6. Hay un delay de **1.2 segundos** entre turnos de bot para que se sienta natural

### Nombres de los bots

| Slot | Nombre |
|------|--------|
| Bot 1 | Bot-A |
| Bot 2 | Bot-B |
| Bot 3 | Bot-C |

---

## Pendientes / Mejoras posibles

- [ ] **Contraseña en login**: ahora cualquiera puede ingresar con cualquier nombre existente
- [ ] **Timer para cantar UNO**: actualmente el servidor no aplica penalidad automática si el jugador no canta en X segundos; depende de que otro jugador lo denuncie
- [x] **Persistencia**: jugadores e historial de partidas en MySQL; partidas activas en memoria
- [ ] **Espectadores**: permitir conectarse a una sala sin jugar
- [ ] **Chat en partida**: evento `mensaje` cliente→servidor, broadcast a la sala
- [ ] **Reconexión**: actualmente si un jugador se desconecta la partida se cancela
- [x] **Bots con IA**: implementado con Gemini 1.5 Flash (1 a 3 bots por partida)

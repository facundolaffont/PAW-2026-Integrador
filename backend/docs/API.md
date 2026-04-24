# API Reference

---

## HTTP

### Registrar jugador
```bash
curl -X POST http://localhost:3000/api/registrarse \
  -H "Content-Type: application/json" \
  -d '{"nombreUsuario": "renzo"}'
```

### Ingresar
```bash
curl -X POST http://localhost:3000/api/ingresar \
  -H "Content-Type: application/json" \
  -d '{"nombreUsuario": "renzo"}'
```

### Crear partida
```bash
curl -X POST http://localhost:3000/api/partidas \
  -H "Content-Type: application/json" \
  -d '{"jugadorId": "UUID", "maxJugadores": 4, "cantidadBots": 2}'
```

### Listar partidas disponibles
```bash
curl http://localhost:3000/api/partidas
```

### Obtener partida
```bash
curl http://localhost:3000/api/partidas/UUID_PARTIDA
```

### Ranking global
```bash
curl http://localhost:3000/api/puntajes
```

---

## WebSocket

### Conectarse
```bash
wscat -c "ws://localhost:3000?jugadorId=UUID_JUGADOR&partidaId=UUID_PARTIDA"
```

### Iniciar partida
```json
{"accion":"iniciar-partida"}
```

### Jugar carta
```json
{"accion":"jugar-carta","cartaId":"UUID_CARTA"}
```

### Jugar comodín (con color elegido)
```json
{"accion":"jugar-carta","cartaId":"UUID_CARTA","colorElegido":"rojo"}
```

### Robar carta
```json
{"accion":"robar-carta"}
```

### Cantar UNO
```json
{"accion":"cantar-uno"}
```

### Denunciar UNO no cantado
```json
{"accion":"denunciar-uno","acusadoId":"UUID_JUGADOR"}
```

---

## Eventos servidor → cliente

### `estado-partida`
Se recibe al unirse a la sala, al iniciar la partida y al terminar cada ronda.
```json
{
  "estado": {
    "partidaId": "UUID",
    "estado": "esperando | jugando | terminada",
    "turno": "UUID_JUGADOR",
    "sentido": 1,
    "cartaEnMesa": { "id": "UUID", "color": "rojo", "tipo": "numero", "valor": 5 },
    "penalidad": 0,
    "jugadores": [
      {
        "jugadorId": "UUID",
        "nombreUsuario": "renzo",
        "cantidadCartas": 7,
        "mano": [ { "id": "UUID", "color": "rojo", "tipo": "numero", "valor": 5 } ]
      }
    ],
    "puntajesRonda": { "UUID_JUGADOR": 120 }
  }
}
```
> `mano` solo está presente para el jugador que recibe el evento. Los demás ven `undefined`.

### `jugador-unido`
Se recibe cuando un jugador se une a la sala.
```json
{
  "jugadorId": "UUID",
  "nombreUsuario": "renzo",
  "totalJugadores": 2
}
```

### `carta-jugada`
Se recibe cuando un jugador (o bot) juega una carta.
```json
{
  "jugadorId": "UUID",
  "carta": { "id": "UUID", "color": "azul", "tipo": "salta", "valor": 20 }
}
```

### `turno-cambiado`
Se recibe después de cada jugada o robo.
```json
{
  "turno": "UUID_JUGADOR",
  "sentido": 1,
  "penalidad": 4,
  "robó": { "jugadorId": "UUID", "cantidad": 2 }
}
```
> `penalidad` y `robó` son opcionales.

### `ronda-terminada`
Se recibe cuando un jugador se queda sin cartas y aún no hay ganador de la partida.
```json
{
  "ganadorRonda": "UUID_JUGADOR",
  "puntosGanados": 150,
  "puntajesRonda": { "UUID_JUGADOR": 320 }
}
```

### `partida-terminada`
Se recibe cuando un jugador acumula 500 puntos o más.
```json
{
  "ranking": [
    { "jugadorId": "UUID", "nombre": "renzo", "puntaje": 520, "puesto": 1, "deltaGlobal": 50 },
    { "jugadorId": "UUID", "nombre": "Bot-A", "puntaje": 130, "puesto": 2, "deltaGlobal": 0 }
  ]
}
```

### `uno-cantado`
Se recibe cuando un jugador (o bot) canta UNO.
```json
{
  "jugadorId": "UUID",
  "nombreUsuario": "renzo"
}
```

### `uno-denunciado`
Se recibe cuando se denuncia con éxito a un jugador que no cantó UNO.
```json
{
  "denuncianteId": "UUID",
  "acusado": "renzo"
}
```

### `jugador-abandono`
Se recibe cuando un jugador se desconecta durante la partida. La partida se cancela.
```json
{
  "jugadorId": "UUID",
  "nombreUsuario": "renzo",
  "mensaje": "La partida fue cancelada por abandono"
}
```

### `error`
Se recibe ante cualquier acción inválida. Solo lo recibe el jugador que la generó.
```json
{
  "mensaje": "No es tu turno"
}
```

---

## Flujo típico

```bash
# 1. Registrarse
curl -X POST http://localhost:3000/api/registrarse \
  -H "Content-Type: application/json" \
  -d '{"nombreUsuario": "renzo"}'

# 2. Crear partida con el jugadorId obtenido
curl -X POST http://localhost:3000/api/partidas \
  -H "Content-Type: application/json" \
  -d '{"jugadorId": "UUID", "cantidadBots": 1}'

# 3. Conectarse con el partidaId obtenido
wscat -c "ws://localhost:3000?jugadorId=UUID&partidaId=UUID_PARTIDA"

# 4. Iniciar
{"accion":"iniciar-partida"}

# 5. Jugar
{"accion":"jugar-carta","cartaId":"UUID_CARTA"}
```

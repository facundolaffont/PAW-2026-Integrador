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

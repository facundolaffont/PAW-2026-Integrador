# Estructura del proyecto

Alineada con el diagrama de niveles del informe de arquitectura:

```sh
PAW-2026-Integrador/
├── docker-compose.yml
├── package.json
├── nginx/
├── docs/
└── src/
    ├── app.js                         # Composition root (Express + WebSocket)
    ├── interfaces/
    │   ├── http/
    │   │   ├── handlers/              # Rutas REST y páginas (manejadorFront = generador de vistas)
    │   │   ├── middleware/            # JWT (API y web)
    │   │   └── seo/                   # Metadatos SEO
    │   └── ws/                        # WebSocket: conexiones y mensajes
    ├── controladores/
    │   ├── AuthController.js          # Registro e ingreso
    │   ├── PartidaController.js       # Orquestación de partidas (juego, bots, timers)
    │   └── PuntajesController.js      # Ranking global
    ├── dominio/                       # Reglas de juego y entidades
    │   ├── Carta.js, Mazo.js
    │   ├── JugadorEnSala.js, SalaDeJuego.js
    │   └── Usuario.js
    ├── presentacion/
    │   ├── views/                     # Plantillas EJS (HTML server-side)
    │   └── public/                    # CSS, JS, imágenes (archivos estáticos)
    ├── errores/
    └── infraestructura/               # Persistencia, integraciones y utilidades
        ├── persistencia/
        │   ├── Persistencia.js        # Facade: partidas en memoria + repos
        │   ├── mysql/                 # MySQL (pool, repositorio, init.sql)
        │   └── memoria/               # Fallback sin DB_HOST
        ├── integraciones/
        │   └── ia/
        │       └── BotLLM.js          # Bot con Gemini
        └── shared/
            ├── logger.js
            └── utils.js
```

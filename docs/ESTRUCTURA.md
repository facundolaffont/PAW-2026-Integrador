# Estructura del proyecto

Alineada con el diagrama de niveles del informe de arquitectura:

```sh
PAW-2026-Integrador/
├── docs/
├── nginx/
└── src/
    ├── controladores/
    │   ├── AuthController.js          # Registro e ingreso
    │   ├── PartidaController.js       # Orquestación de partidas (juego, bots, timers)
    │   └── PuntajesController.js      # Ranking global
    ├── dominio/                       # Reglas de juego y entidades
    ├── errores/
    ├── infraestructura/               # Persistencia, integraciones y utilidades
    │   ├── integraciones/
    │   │   └── ia/
    │   │       └── BotLLM.js          # Bot con Gemini
    │   ├── persistencia/
    │   │   ├── memoria/               # Fallback sin DB_HOST
    │   │   ├── mysql/                 # MySQL (pool, repositorio, init.sql)
    │   │   └── Persistencia.js        # Facade: partidas en memoria + repos
    │   └── shared/                    # Archivos compartidos por toda la app.
    ├── interfaces/
    │   ├── http/
    │   │   ├── handlers/              # Rutas REST y páginas (manejadorFront = generador de vistas)
    │   │   ├── middleware/            # JWT (API y web)
    │   │   └── seo/                   # Metadatos SEO
    │   └── ws/                        # WebSocket: conexiones y mensajes
    ├── presentacion/
    │   ├── public/                    # CSS, JS, imágenes (archivos estáticos)
    │   └── views/                     # Plantillas EJS (HTML server-side)
    └── app.js                         # Composition root (Express + WebSocket)
```

CREATE TABLE IF NOT EXISTS jugadores (
  id VARCHAR(36) PRIMARY KEY,
  nombre_usuario VARCHAR(50) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS partidas (
  id VARCHAR(36) PRIMARY KEY,
  fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
  estado VARCHAR(20) NOT NULL
);

CREATE TABLE IF NOT EXISTS partida_jugadores (
  partida_id VARCHAR(36) NOT NULL,
  jugador_id VARCHAR(36) NOT NULL,
  puesto TINYINT NOT NULL,
  puntaje_ronda INT NOT NULL,
  delta_global INT NOT NULL,
  PRIMARY KEY (partida_id, jugador_id),
  FOREIGN KEY (partida_id) REFERENCES partidas(id),
  FOREIGN KEY (jugador_id) REFERENCES jugadores(id)
);

// Variante del paquete de Node.js mysql2
// que expone una API basada en Promises en
// lugar de callbacks.
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'uno',
  password: process.env.DB_PASSWORD || 'uno',
  database: process.env.DB_NAME || 'uno',

  // Si están todas las conexiones ocupadas,
  // la próxima petición espera encolada.
  waitForConnections: true,

  // Habilita 10 conexiones reutilizables.
  connectionLimit: 10,

});

module.exports = pool;

const sql = require('mssql');
require('dotenv').config();

// Parsear el servidor si viene con instancia (ej. localhost\SQLEXPRESS)
const [host, instance] = (process.env.DB_SERVER || 'localhost').split('\\');

const config = {
  server: host,
  ...(instance ? {} : { port: parseInt(process.env.DB_PORT || '1433', 10) }),
  database: process.env.DB_NAME || 'EcosistemaNK',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: {
    ...(instance ? { instanceName: instance } : {}),
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_CERT !== 'false',
  },
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
  requestTimeout: 15000,
};

// Variable para guardar la conexión y no crear una nueva cada vez
let poolPromise = null;

// 1. La función getPool que busca tu server.js
function getPool() {
  if (!poolPromise) {
    poolPromise = sql.connect(config);
  }
  return poolPromise;
}

// 2. La función query para hacer consultas SQL
async function query(text, params) {
  const pool = await getPool();
  const request = pool.request();
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      request.input(key, value);
    }
  }
  return request.query(text);
}

// Exportamos todo lo necesario
module.exports = { getPool, query, config };
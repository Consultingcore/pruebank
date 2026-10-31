const sql = require('mssql');
require('dotenv').config();

const config = {
  server: process.env.DB_SERVER || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '1433', 10),
  database: process.env.DB_NAME || 'EcosistemaNK',
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD,
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true,
  },
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
  requestTimeout: 15000,
};

let poolPromise = null;

function getPool() {
  if (!poolPromise) {
    poolPromise = sql.connect(config);
  }
  return poolPromise;
}

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

// --- PRUEBA AUTOMÁTICA ---
async function verTablas() {
  try {
    const pool = await getPool();
    const result = await pool.request().query("SELECT TABLE_CATALOG, TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Users'");
    console.log('\n--- ¿QUÉ VE NODE.JS EN SU BASE DE DATOS? ---');
    if (result.recordset.length === 0) {
      console.log('❌ Node.js NO VE LA TABLA USERS.');
    } else {
      console.log('✔ Node.js VE ESTAS TABLAS:', result.recordset);
    }
    console.log('-------------------------------------------\n');
  } catch (err) {
    console.error('Error en prueba:', err.message);
  }
}
verTablas();
// --- SCRIPT DE EMERGENCIA: CREAR TABLAS ---
async function forzarCreacionTablas() {
  try {
    const pool = await getPool();
    
    // 1. Crear la tabla Users si no existe
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Users' and xtype='U')
      BEGIN
        CREATE TABLE Users (
          id INT IDENTITY(1,1) PRIMARY KEY,
          email NVARCHAR(255) UNIQUE NOT NULL,
          password_hash NVARCHAR(255),
          name NVARCHAR(100),
          role NVARCHAR(50) DEFAULT 'free',
          google_id NVARCHAR(255),
          created_at DATETIME DEFAULT GETDATE()
        );
        PRINT '¡Tabla Users creada exitosamente por Node.js!';
      END
    `);

    // 2. Crear la tabla Profiles si no existe
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Profiles' and xtype='U')
      BEGIN
        CREATE TABLE Profiles (
          id INT IDENTITY(1,1) PRIMARY KEY,
          user_id INT FOREIGN KEY REFERENCES Users(id) ON DELETE CASCADE,
          created_at DATETIME DEFAULT GETDATE()
        );
        PRINT '¡Tabla Profiles creada exitosamente por Node.js!';
      END
    `);
    
    console.log('\n--- VERIFICACIÓN FINAL ---');
    const result = await pool.request().query("SELECT TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME IN ('Users', 'Profiles')");
    console.log('✔ Tablas visibles para Node.js:', result.recordset);
    console.log('--------------------------\n');

  } catch (err) {
    console.error('Error creando tablas:', err.message);
  }
}

// Ejecutamos la creación al arrancar
getPool().then(() => forzarCreacionTablas());
// Función para obtener la fecha de hoy en formato YYYY-MM-DD
function todayStr() {
  return new Date().toLocaleDateString('en-CA', { timeZone: process.env.APP_TZ || 'America/Mexico_City' });
}

// Función para preparar el parámetro de fecha para SQL Server
function dateParam(day) {
  return new Date(day + 'T12:00:00Z');
}

module.exports = { getPool, query, config, todayStr, dateParam };



require('dotenv').config();
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

/**
 * Crea la base de datos (si no existe) y ejecuta db/schema.sql.
 * Uso: npm run db:init
 */
(async () => {
  const dbName = process.env.DB_NAME || 'NucleoKokon';
  if (!/^[A-Za-z0-9_]+$/.test(dbName)) throw new Error('DB_NAME solo puede contener letras, números y guion bajo');

  const base = {
    server: process.env.DB_SERVER || 'localhost',
    port: parseInt(process.env.DB_PORT || '1433', 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    options: { encrypt: process.env.DB_ENCRYPT === 'true', trustServerCertificate: process.env.DB_TRUST_CERT !== 'false' },
  };

  let pool = await new sql.ConnectionPool({ ...base, database: 'master' }).connect().catch(async (e) => {
    // Azure SQL no permite conectarse a master con algunos usuarios: intenta directo a la BD
    console.warn('No se pudo usar master, intentando conexión directa:', e.message);
    return null;
  });
  if (pool) {
    await pool.request().query(`IF DB_ID('${dbName}') IS NULL CREATE DATABASE [${dbName}]`);
    await pool.close();
  }

  pool = await new sql.ConnectionPool({ ...base, database: dbName }).connect();
  const batches = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8')
    .split(/^\s*GO\s*$/im).map((b) => b.trim()).filter(Boolean);
  for (const b of batches) await pool.request().batch(b);
  await pool.close();
  console.log(`✔ Base de datos "${dbName}" lista (${batches.length} bloques ejecutados)`);
})().catch((e) => { console.error('✖', e.message); process.exit(1); });

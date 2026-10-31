require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('✖ JWT_SECRET no está definido o es demasiado corto (mínimo 32 caracteres). Revisa tu archivo .env');
  process.exit(1);
}

const { getPool } = require('./db');
const authRoutes = require('./routes/auth');
const { router: priorityRoutes } = require('./routes/priorities');
const checkinRoutes = require('./routes/checkins');
const dashboardRoutes = require('./routes/dashboard');
const chatRoutes = require('./routes/chat');   // ← NUEVA LÍNEA 1
const app = express();
app.disable('x-powered-by');
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://accounts.google.com/gsi/client'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://accounts.google.com/gsi/style', 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'", 'https://accounts.google.com/gsi/'],
        frameSrc: ["'self'", 'https://accounts.google.com/gsi/'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }, // requerido por el popup de Google
  })
);
app.use(express.json({ limit: '50kb' }));

app.get('/api/health', async (req, res) => {
  try { await getPool(); res.json({ ok: true, db: 'conectada' }); }
  catch (e) { res.status(503).json({ ok: false, db: 'sin conexión', detail: process.env.NODE_ENV === 'production' ? undefined : e.message }); }
});

app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/priorities', priorityRoutes);
app.use('/api/checkins', checkinRoutes);
app.use('/api/chat', chatRoutes);              // ← NUEVA LÍNEA 2
app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads'), { maxAge: '7d', index: false }));
app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));

// Manejador central: nunca filtra detalles internos al cliente
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err);
  res.status(500).json({ error: 'Ocurrió un error inesperado. Intenta de nuevo.' });
});

const port = parseInt(process.env.PORT || '3000', 10);
app.listen(port, () => {
  console.log(`✔ Núcleo Kokón en http://localhost:${port}`);
  getPool().then(() => console.log('✔ SQL Server conectado')).catch((e) => console.error('✖ SQL Server:', e.message));
});

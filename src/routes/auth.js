const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { OAuth2Client } = require('google-auth-library');
const { query } = require('../db');
const { signToken, auth } = require('../middleware/auth');
const { sendResetEmail, smtpEnabled } = require('../services/mailer');

const router = express.Router();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Intenta de nuevo en unos minutos.' },
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const normEmail = (e) => String(e || '').trim().toLowerCase();
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const DUMMY_HASH = bcrypt.hashSync('no-existe', 12); 

const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role });
const session = (u) => ({ token: signToken(u), user: publicUser(u) });
const isDuplicate = (err) => err && (err.number === 2627 || err.number === 2601);

function validatePassword(pw) {
  if (pw.length < 8) return 'La contraseña debe tener al menos 8 caracteres';
  if (pw.length > 72) return 'La contraseña no puede superar 72 caracteres';
  return null;
}

router.get('/config', (req, res) => {
  res.json({ googleClientId: process.env.GOOGLE_CLIENT_ID || null });
});

// ---- Registro ----
router.post('/register', limiter, async (req, res, next) => {
  try {
    const email = normEmail(req.body.email);
    const password = String(req.body.password || '');
    const name = String(req.body.name || '').trim().slice(0, 100);
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Correo electrónico no válido' });
    const pwErr = validatePassword(password);
    if (pwErr) return res.status(400).json({ error: pwErr });

    const hash = await bcrypt.hash(password, 12);
    
    // BUSCAMOS EN LA RUTA ABSOLUTA
    const r = await query(
      `INSERT INTO EcosistemaNK.dbo.Users (email, password_hash, name, role)
       OUTPUT INSERTED.id, INSERTED.email, INSERTED.name, INSERTED.role
       VALUES (@email, @hash, @name, 'free')`,
      { email, hash, name: name || null }
    );
    const user = r.recordset[0];
    await query('INSERT INTO EcosistemaNK.dbo.Profiles (user_id) VALUES (@id)', { id: user.id });
    res.status(201).json(session(user));
  } catch (err) {
    if (isDuplicate(err)) return res.status(409).json({ error: 'Ya existe una cuenta con ese correo' });
    next(err);
  }
});

// ---- Inicio de sesión ----
router.post('/login', limiter, async (req, res, next) => {
  try {
    const email = normEmail(req.body.email);
    const password = String(req.body.password || '');
    
    // BUSCAMOS EN LA RUTA ABSOLUTA
    const r = await query('SELECT id, email, name, role, password_hash FROM EcosistemaNK.dbo.Users WHERE email = @email', { email });
    const user = r.recordset[0];
    const ok = await bcrypt.compare(password, user?.password_hash || DUMMY_HASH);
    if (!user || !user.password_hash || !ok) {
      return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
    }
    res.json(session(user));
  } catch (err) { next(err); }
});

// ---- Recuperación de contraseña: solicitud ----
router.post('/forgot', limiter, async (req, res, next) => {
  try {
    const email = normEmail(req.body.email);
    const generic = { message: 'Si el correo existe, recibirás un enlace para crear una nueva contraseña.' };
    if (!EMAIL_RE.test(email)) return res.json(generic);

    const r = await query('SELECT id FROM EcosistemaNK.dbo.Users WHERE email = @email', { email });
    const user = r.recordset[0];
    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      await query(
        `INSERT INTO EcosistemaNK.dbo.PasswordResets (user_id, token_hash, expires_at)
         VALUES (@uid, @th, DATEADD(MINUTE, 30, SYSUTCDATETIME()))`,
        { uid: user.id, th: sha256(token) }
      );
      const link = `${process.env.APP_URL || 'http://localhost:3000'}/index.html?reset=${token}`;
      await sendResetEmail(email, link);
      if (process.env.NODE_ENV !== 'production' && !smtpEnabled()) generic.devLink = link;
    }
    res.json(generic);
  } catch (err) { next(err); }
});

// ---- Recuperación de contraseña: nueva contraseña ----
router.post('/reset', limiter, async (req, res, next) => {
  try {
    const token = String(req.body.token || '');
    const password = String(req.body.password || '');
    const pwErr = validatePassword(password);
    if (pwErr) return res.status(400).json({ error: pwErr });

    const r = await query(
      `SELECT id, user_id FROM EcosistemaNK.dbo.PasswordResets
       WHERE token_hash = @th AND used_at IS NULL AND expires_at > SYSUTCDATETIME()`,
      { th: sha256(token) }
    );
    const row = r.recordset[0];
    if (!row) return res.status(400).json({ error: 'El enlace no es válido o ya expiró' });

    const hash = await bcrypt.hash(password, 12);
    await query('UPDATE EcosistemaNK.dbo.Users SET password_hash = @hash WHERE id = @uid', { hash, uid: row.user_id });
    await query(
      'UPDATE EcosistemaNK.dbo.PasswordResets SET used_at = SYSUTCDATETIME() WHERE user_id = @uid AND used_at IS NULL',
      { uid: row.user_id }
    );
    res.json({ message: 'Contraseña actualizada. Ya puedes iniciar sesión.' });
  } catch (err) { next(err); }
});

// ---- Google OAuth ----
let googleClient = null;
router.post('/google', limiter, async (req, res, next) => {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) return res.status(501).json({ error: 'Inicio con Google no configurado' });
    googleClient = googleClient || new OAuth2Client(clientId);

    const ticket = await googleClient.verifyIdToken({ idToken: String(req.body.credential || ''), audience: clientId });
    const p = ticket.getPayload();
    if (!p?.email || !p.email_verified) return res.status(401).json({ error: 'Tu cuenta de Google no tiene un correo verificado' });
    const email = normEmail(p.email);

    let r = await query('SELECT id, email, name, role FROM EcosistemaNK.dbo.Users WHERE google_id = @gid', { gid: p.sub });
    let user = r.recordset[0];

    if (!user) {
      r = await query('SELECT id, email, name, role FROM EcosistemaNK.dbo.Users WHERE email = @email', { email });
      user = r.recordset[0];
      if (user) {
        await query('UPDATE EcosistemaNK.dbo.Users SET google_id = @gid WHERE id = @id', { gid: p.sub, id: user.id });
      } else {
        r = await query(
          `INSERT INTO EcosistemaNK.dbo.Users (email, name, role, google_id)
           OUTPUT INSERTED.id, INSERTED.email, INSERTED.name, INSERTED.role
           VALUES (@email, @name, 'free', @gid)`,
          { email, name: String(p.name || '').slice(0, 100) || null, gid: p.sub }
        );
        user = r.recordset[0];
        await query('INSERT INTO EcosistemaNK.dbo.Profiles (user_id) VALUES (@id)', { id: user.id });
      }
    }
    res.json(session(user));
  } catch (err) {
    if (/token|audience|signature|expired/i.test(err.message)) return res.status(401).json({ error: 'No se pudo verificar tu cuenta de Google' });
    next(err);
  }
});

// ---- Usuario actual ----
router.get('/me', auth, async (req, res, next) => {
  try {
    const r = await query('SELECT id, email, name, role FROM EcosistemaNK.dbo.Users WHERE id = @id', { id: req.user.id });
    if (!r.recordset[0]) return res.status(401).json({ error: 'Usuario no encontrado' });
    res.json({ user: publicUser(r.recordset[0]) });
  } catch (err) { next(err); }
});

module.exports = router;
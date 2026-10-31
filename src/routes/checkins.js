const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const { query, dateParam, todayStr, dateOut, sql } = require('../db');
const { auth } = require('../middleware/auth');
const { CHECKIN_TYPES, MAX_CHECKINS_PER_DAY } = require('../services/sustainability');

const router = express.Router();
router.use(auth);

// ---- Subida de foto del espacio (Innovación V1) ----
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    // nombre aleatorio: nunca se usa el nombre que envía el cliente
    filename: (req, file, cb) => cb(null, `${crypto.randomBytes(16).toString('hex')}${EXT[file.mimetype] || ''}`),
  }),
  limits: { fileSize: 3 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => cb(EXT[file.mimetype] ? null : new Error('Solo se permiten imágenes JPG, PNG o WebP'), Boolean(EXT[file.mimetype])),
});

router.post('/photo', (req, res, next) => {
  upload.single('photo')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'La foto no puede superar 3 MB' : err.message });
    if (!req.file) return res.status(400).json({ error: 'Adjunta una foto' });
    res.status(201).json({ photo_url: `/uploads/${req.file.filename}` });
  });
});

// ---- Check-ins del día ----
const validType = async (userId, type) => {
  if (CHECKIN_TYPES.some((c) => c.type === type)) return true;
  const m = /^habito:([a-z0-9]{4,12})$/.exec(type);
  if (!m) return false;
  const r = await query('SELECT habitos_personalizados AS h FROM Profiles WHERE user_id = @uid', { uid: userId });
  try { return JSON.parse(r.recordset[0]?.h || '[]').some((h) => h.id === m[1]); } catch { return false; }
};

router.get('/today', async (req, res, next) => {
  try {
    const r = await query(
      `SELECT type, value, photo_url FROM CheckIns WHERE user_id = @uid AND [date] = @d ORDER BY id`,
      { uid: req.user.id, d: dateParam(todayStr()) }
    );
    res.json({ checkins: r.recordset });
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const type = String(req.body.type || '');
    const value = Math.round(Number(req.body.value));
    const photoUrl = req.body.photo_url ? String(req.body.photo_url) : null;

    if (!(await validType(req.user.id, type))) return res.status(400).json({ error: 'Tipo de check-in no válido' });
    if (!Number.isInteger(value) || value < 1 || value > 5) return res.status(400).json({ error: 'El valor debe estar entre 1 y 5' });
    if (photoUrl && !/^\/uploads\/[a-f0-9]{32}\.(jpg|png|webp)$/.test(photoUrl)) return res.status(400).json({ error: 'Foto no válida' });

    const day = todayStr();
    const params = { uid: req.user.id, d: dateParam(day), type, value: String(value), photo: photoUrl };

    const upd = await query(
      `UPDATE CheckIns SET value = @value, photo_url = COALESCE(@photo, photo_url)
       WHERE user_id = @uid AND [date] = @d AND type = @type`, params
    );
    if (!upd.rowsAffected[0]) {
      const cnt = await query('SELECT COUNT(*) AS n FROM CheckIns WHERE user_id = @uid AND [date] = @d', params);
      if (cnt.recordset[0].n >= MAX_CHECKINS_PER_DAY) {
        return res.status(409).json({ error: `Máximo ${MAX_CHECKINS_PER_DAY} check-ins por día` });
      }
      await query(
        `INSERT INTO CheckIns (user_id, [date], type, value, photo_url) VALUES (@uid, @d, @type, @value, @photo)`, params
      );
    }

    // Índice de Sostenibilidad = promedio de los últimos 7 días (escala 1-5 → 0-100)
    const since = dateParam(todayStr(-6));
    await query(
      `UPDATE Profiles SET indice_sostenibilidad = ISNULL((
          SELECT CAST(ROUND(AVG(CAST(TRY_CAST(value AS FLOAT) AS FLOAT)) * 20, 0) AS INT)
          FROM CheckIns WHERE user_id = @uid AND [date] >= @since AND TRY_CAST(value AS FLOAT) IS NOT NULL
        ), indice_sostenibilidad), updated_at = SYSUTCDATETIME()
       WHERE user_id = @uid`,
      { uid: req.user.id, since }
    );

    const r = await query(
      `SELECT type, value, photo_url FROM CheckIns WHERE user_id = @uid AND [date] = @d ORDER BY id`, params
    );
    res.json({ checkins: r.recordset });
  } catch (err) { next(err); }
});

module.exports = router;

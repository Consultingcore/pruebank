const crypto = require('crypto');
const express = require('express');
const { query, dateParam, todayStr } = require('../db');
const { auth } = require('../middleware/auth');
const { listForDay } = require('./priorities');
const { getBookingsForDay } = require('../services/calcom');
const S = require('../services/sustainability');

const router = express.Router();
router.use(auth);

/** Inyecta webinars/mentorías de Cal.com como prioridad #1 (idempotente por external_id) */
async function injectCalEvents(user, day) {
  const bookings = await getBookingsForDay(user.email, day);
  for (const b of bookings) {
    await query(
      `IF NOT EXISTS (SELECT 1 FROM Priorities WHERE user_id = @uid AND external_id = @ext)
         INSERT INTO Priorities (user_id, [date], title, is_event, event_type, external_id, sort_order)
         VALUES (@uid, @d, @title, 1, @etype, @ext, 1)`,
      { uid: user.id, d: dateParam(day), title: b.title, etype: b.type, ext: b.uid }
    );
  }
}

router.get('/', async (req, res, next) => {
  try {
    const day = todayStr();
    const u = await query('SELECT id, email, name, role FROM Users WHERE id = @id', { id: req.user.id });
    const user = u.recordset[0];
    if (!user) return res.status(401).json({ error: 'Usuario no encontrado' });

    await injectCalEvents(user, day);

    const [prof, phrases, checkins, priorities] = await Promise.all([
      query('SELECT diagnostico, indice_sostenibilidad AS idx, habitos_personalizados AS habits, ancla_semanal FROM Profiles WHERE user_id = @id', { id: user.id }),
      query('SELECT text FROM AnchorPhrases WHERE active = 1 ORDER BY sort_order'),
      query('SELECT type, value, photo_url FROM CheckIns WHERE user_id = @id AND [date] = @d ORDER BY id', { id: user.id, d: dateParam(day) }),
      listForDay(user.id, day),
    ]);

    const p = prof.recordset[0] || { idx: 50, habits: '[]' };
    let habits = [];
    try { habits = JSON.parse(p.habits || '[]'); } catch { /* JSON inválido: se ignora */ }

    const index = p.idx;
    const ci = checkins.recordset;
    res.json({
      date: day,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      sustainability: { index, semaforo: S.semaforo(index), maxPriorities: S.maxPrioritiesFor(index) },
      priorities,
      phrases: phrases.recordset.map((r) => r.text),
      weeklyAnchor: p.ancla_semanal || null,
      checkinTypes: S.CHECKIN_TYPES,
      maxCheckins: S.MAX_CHECKINS_PER_DAY,
      habits,
      checkins: ci,
      hasPhotoToday: ci.some((c) => c.photo_url),
      rings: S.computeRings(ci, priorities),
    });
  } catch (err) { next(err); }
});

// ---- Hábitos personalizados (guardados como JSON en Profiles) ----
router.put('/habits', async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim().slice(0, 60);
    if (!name) return res.status(400).json({ error: 'Escribe el nombre del hábito' });
    const r = await query('SELECT habitos_personalizados AS h FROM Profiles WHERE user_id = @id', { id: req.user.id });
    let habits = [];
    try { habits = JSON.parse(r.recordset[0]?.h || '[]'); } catch { /* vacío */ }
    if (habits.length >= 6) return res.status(409).json({ error: 'Puedes tener hasta 6 hábitos personalizados' });
    habits.push({ id: crypto.randomBytes(4).toString('hex'), name });
    await query('UPDATE Profiles SET habitos_personalizados = @h, updated_at = SYSUTCDATETIME() WHERE user_id = @id', {
      h: JSON.stringify(habits), id: req.user.id,
    });
    res.status(201).json({ habits });
  } catch (err) { next(err); }
});

module.exports = router;

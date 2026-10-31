const express = require('express');
const { query, dateParam, todayStr, dateOut } = require('../db');
const { auth } = require('../middleware/auth');
const { maxPrioritiesFor, MAX_PRIORITIES } = require('../services/sustainability');

const router = express.Router();
router.use(auth);

const mapRow = (r) => ({
  id: r.id,
  date: dateOut(r.date),
  title: r.title,
  is_completed: Boolean(r.is_completed),
  is_event: Boolean(r.is_event),
  event_type: r.event_type,
  sort_order: r.sort_order,
});

/** Prioridades del día: eventos (webinar/mentoría) siempre primero, máximo 4 visibles */
async function listForDay(userId, day) {
  const r = await query(
    `SELECT TOP (${MAX_PRIORITIES}) id, [date], title, is_completed, is_event, event_type, sort_order
     FROM Priorities WHERE user_id = @uid AND [date] = @d
     ORDER BY is_event DESC, sort_order, id`,
    { uid: userId, d: dateParam(day) }
  );
  return r.recordset.map(mapRow).map((p, i) => ({ ...p, sort_order: i + 1 }));
}

router.get('/', async (req, res, next) => {
  try {
    const day = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : todayStr();
    res.json({ date: day, priorities: await listForDay(req.user.id, day) });
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const title = String(req.body.title || '').trim().slice(0, 200);
    if (!title) return res.status(400).json({ error: 'Escribe un título para tu prioridad' });
    const day = todayStr();

    const prof = await query('SELECT indice_sostenibilidad AS idx FROM Profiles WHERE user_id = @uid', { uid: req.user.id });
    const limit = maxPrioritiesFor(prof.recordset[0]?.idx ?? 50);
    const cnt = await query('SELECT COUNT(*) AS n FROM Priorities WHERE user_id = @uid AND [date] = @d', {
      uid: req.user.id, d: dateParam(day),
    });
    const n = cnt.recordset[0].n;
    if (n >= limit) {
      return res.status(409).json({
        error: `Hoy tu sistema sostiene ${limit} prioridades. Completa o quita una antes de agregar otra.`,
      });
    }

    await query(
      `INSERT INTO Priorities (user_id, [date], title, sort_order) VALUES (@uid, @d, @title, @ord)`,
      { uid: req.user.id, d: dateParam(day), title, ord: Math.min(n + 1, MAX_PRIORITIES) }
    );
    res.status(201).json({ priorities: await listForDay(req.user.id, day) });
  } catch (err) { next(err); }
});

router.patch('/:id/toggle', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Identificador no válido' });
    const r = await query(
      `UPDATE Priorities SET is_completed = CASE WHEN is_completed = 1 THEN 0 ELSE 1 END
       OUTPUT INSERTED.[date] AS date
       WHERE id = @id AND user_id = @uid`,
      { id, uid: req.user.id }
    );
    if (!r.recordset[0]) return res.status(404).json({ error: 'Prioridad no encontrada' });
    res.json({ priorities: await listForDay(req.user.id, dateOut(r.recordset[0].date)) });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Identificador no válido' });
    const r = await query(
      `DELETE FROM Priorities OUTPUT DELETED.[date] AS date
       WHERE id = @id AND user_id = @uid AND is_event = 0`,
      { id, uid: req.user.id }
    );
    if (!r.recordset[0]) return res.status(404).json({ error: 'Prioridad no encontrada' });
    res.json({ priorities: await listForDay(req.user.id, dateOut(r.recordset[0].date)) });
  } catch (err) { next(err); }
});

module.exports = { router, listForDay };

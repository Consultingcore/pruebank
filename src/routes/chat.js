// routes/chat.js
const express = require('express');
const rateLimit = require('express-rate-limit');
const { query } = require('../db');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Límite: 30 mensajes cada 10 min por IP (evita abuso de la API de IA)
const chatLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados mensajes. Espera un momento antes de continuar.' },
});

const MAX_MSG_LENGTH = 2000;
const HISTORY_LIMIT = 12; // últimos 12 mensajes de contexto

// ---------------------------------------------------------------
// POST /api/chat — Envía un mensaje y recibe respuesta de la IA
// ---------------------------------------------------------------
router.post('/', auth, chatLimiter, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const message = String(req.body.message || '').trim();
    let conversationId = req.body.conversation_id ? parseInt(req.body.conversation_id, 10) : null;

    if (!message) return res.status(400).json({ error: 'El mensaje está vacío' });
    if (message.length > MAX_MSG_LENGTH) {
      return res.status(400).json({ error: `El mensaje no puede superar ${MAX_MSG_LENGTH} caracteres` });
    }

    // 1. Verificar/crear conversación
    if (conversationId) {
      const check = await query(
        'SELECT id FROM ChatConversations WHERE id = @id AND user_id = @uid',
        { id: conversationId, uid: userId }
      );
      if (!check.recordset[0]) conversationId = null; // no existe o no es tuya
    }
    if (!conversationId) {
      const created = await query(
        `INSERT INTO ChatConversations (user_id, title)
         OUTPUT INSERTED.id
         VALUES (@uid, @title)`,
        { uid: userId, title: message.slice(0, 80) }
      );
      conversationId = created.recordset[0].id;
    }

    // 2. Guardar mensaje del usuario
    await query(
      `INSERT INTO ChatMessages (conversation_id, role, content)
       VALUES (@cid, 'user', @content)`,
      { cid: conversationId, content: message }
    );

    // 3. Cargar contexto: perfil + últimas prioridades/check-ins + historial
    const [profileR, prioritiesR, checkinsR, historyR] = await Promise.all([
      query(
        `SELECT TOP 1 u.name, p.*
         FROM Users u
         LEFT JOIN Profiles p ON p.user_id = u.id
         WHERE u.id = @uid`,
        { uid: userId }
      ),
      query(
        `SELECT TOP 5 title, is_completed
         FROM Priorities
         WHERE user_id = @uid AND CAST(created_at AS DATE) = CAST(SYSUTCDATETIME() AS DATE)
         ORDER BY created_at DESC`,
        { uid: userId }
      ),
      query(
        `SELECT TOP 7 type, value, CAST(created_at AS DATE) AS day
         FROM Checkins
         WHERE user_id = @uid
         ORDER BY created_at DESC`,
        { uid: userId }
      ),
      query(
        `SELECT TOP (@lim) role, content
         FROM ChatMessages
         WHERE conversation_id = @cid
         ORDER BY created_at DESC`,
        { cid: conversationId, lim: HISTORY_LIMIT }
      ),
    ]);

    const profile = profileR.recordset[0] || {};
    const priorities = prioritiesR.recordset || [];
    const checkins = checkinsR.recordset || [];
    const history = (historyR.recordset || []).reverse(); // orden cronológico

    // 4. Construir system prompt con contexto real del usuario
    const systemPrompt = `Eres el asistente de Núcleo Kokón, un ecosistema de sostenibilidad humana para equipos y proyectos con impacto social en Latinoamérica.

TU VOZ:
- Cálida, precisa, profunda. Nunca genérica ni corporativa.
- Hablas en español neutro latinoamericano.
- Usas frases cortas. Prefieres preguntas a afirmaciones cuando algo no está claro.
- Nunca usas emojis. Nunca usas viñetas. Solo prosa fluida.
- Máximo 4 párrafos cortos por respuesta.

PRINCIPIOS QUE ENCARNA:
- Cuidado humano antes que productividad.
- Claridad sin violencia.
- Sostenibilidad: los proyectos solo avanzan si quienes los sostienen están bien.
- Metáfora del kokón: un espacio íntimo donde la transformación ocurre con protección.

CONTEXTO DEL USUARIO:
- Nombre: ${profile.name || 'sin nombre'}
- Rol en la plataforma: ${req.user.role || 'free'}
- Prioridades de hoy: ${priorities.length ? priorities.map(p => `"${p.title}" ${p.is_completed ? '(completada)' : '(pendiente)'}`).join(', ') : 'aún no define prioridades'}
- Últimos check-ins: ${checkins.length ? checkins.map(c => `${c.type}=${c.value} (${new Date(c.day).toLocaleDateString('es-MX')})`).join(', ') : 'sin check-ins recientes'}

INSTRUCCIONES:
- Si el usuario pregunta algo operativo, ayúdalo con claridad.
- Si expresa agotamiento o duda, valida primero, luego ofrece un paso pequeño.
- Si no sabes algo, dilo. No inventes datos sobre Núcleo Kokón.
- Si detectas riesgo emocional serio, sugiere hablar con un profesional humano.`;

    // 5. Llamar a la IA (Anthropic Claude)
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: 'El asistente no está configurado todavía. Contacta al equipo de Núcleo Kokón.' });
    }

    const messages = history.map(h => ({
      role: h.role === 'assistant' ? 'assistant' : 'user',
      content: h.content,
    }));

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 800,
        system: systemPrompt,
        messages,
      }),
    });

    if (!aiRes.ok) {
      const detail = await aiRes.text();
      console.error('Anthropic error:', aiRes.status, detail);
      return res.status(502).json({ error: 'El asistente no pudo responder. Intenta de nuevo en un momento.' });
    }

    const aiData = await aiRes.json();
    const reply = aiData.content?.[0]?.text?.trim();

    if (!reply) {
      return res.status(502).json({ error: 'El asistente devolvió una respuesta vacía.' });
    }

    // 6. Guardar respuesta de la IA
    await query(
      `INSERT INTO ChatMessages (conversation_id, role, content)
       VALUES (@cid, 'assistant', @content)`,
      { cid: conversationId, content: reply }
    );
    await query(
      'UPDATE ChatConversations SET updated_at = SYSUTCDATETIME() WHERE id = @cid',
      { cid: conversationId }
    );

    res.json({ conversation_id: conversationId, reply });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------
// GET /api/chat/history — Carga la conversación más reciente
// ---------------------------------------------------------------
router.get('/history', auth, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const convR = await query(
      `SELECT TOP 1 id, title, created_at
       FROM ChatConversations
       WHERE user_id = @uid
       ORDER BY updated_at DESC`,
      { uid: userId }
    );
    const conv = convR.recordset[0];
    if (!conv) return res.json({ conversation: null, messages: [] });

    const msgR = await query(
      `SELECT role, content, created_at
       FROM ChatMessages
       WHERE conversation_id = @cid
       ORDER BY created_at ASC`,
      { cid: conv.id }
    );
    res.json({ conversation: conv, messages: msgR.recordset });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------
// POST /api/chat/new — Empieza una conversación nueva
// ---------------------------------------------------------------
router.post('/new', auth, async (req, res, next) => {
  try {
    const r = await query(
      `INSERT INTO ChatConversations (user_id) OUTPUT INSERTED.id VALUES (@uid)`,
      { uid: req.user.id }
    );
    res.json({ conversation_id: r.recordset[0].id });
  } catch (err) { next(err); }
});

module.exports = router;
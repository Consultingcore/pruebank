/**
 * Integración con Cal.com (API v2). Devuelve las reservas del usuario en un día.
 *
 * ⚠️ Validar contra la documentación vigente de Cal.com (cal.com/docs/api-reference/v2)
 * antes de producción: la ruta, la versión (cal-api-version) y los filtros pueden cambiar.
 * Si CAL_API_KEY no está definida o la API falla, devuelve [] y el dashboard sigue funcionando.
 */
async function getBookingsForDay(email, dayStr) {
  const key = process.env.CAL_API_KEY;
  if (!key) return [];

  const url = new URL('https://api.cal.com/v2/bookings');
  url.searchParams.set('attendeeEmail', email);
  url.searchParams.set('afterStart', `${dayStr}T00:00:00.000Z`);
  url.searchParams.set('beforeEnd', `${dayStr}T23:59:59.999Z`);
  url.searchParams.set('status', 'upcoming');

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${key}`, 'cal-api-version': '2024-08-13' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.warn(`[calcom] HTTP ${res.status}`);
      return [];
    }
    const body = await res.json();
    const list = Array.isArray(body.data) ? body.data : [];
    const keyword = (process.env.CAL_WEBINAR_KEYWORD || 'webinar').toLowerCase();
    return list.map((b) => {
      const title = String(b.title || 'Sesión').slice(0, 150);
      return {
        uid: String(b.uid || b.id),
        title,
        start: b.start,
        type: title.toLowerCase().includes(keyword) ? 'webinar' : 'mentoria',
      };
    });
  } catch (err) {
    console.warn('[calcom] no disponible:', err.message);
    return [];
  }
}

module.exports = { getBookingsForDay };

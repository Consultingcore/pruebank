/**
 * Reglas de sostenibilidad (Fase 3). Mantenerlas aquí facilita ajustarlas
 * con la facilitadora sin tocar rutas ni UI.
 */

// Catálogo único de check-ins (la UI lo recibe desde /api/dashboard)
const CHECKIN_TYPES = [
  { type: 'sueno', label: 'Sueño', emoji: '😴', axis: 'cuerpo' },
  { type: 'alimentacion', label: 'Alimentación', emoji: '🍽️', axis: 'cuerpo' },
  { type: 'agua', label: 'Agua', emoji: '💧', axis: 'cuerpo' },
  { type: 'movimiento', label: 'Movimiento', emoji: '🏃', axis: 'cuerpo' },
  { type: 'energia', label: 'Energía', emoji: '🔋', axis: 'cuerpo' },
  { type: 'estado_mental', label: 'Estado mental/emocional', emoji: '🧠', axis: 'emocion' },
  { type: 'planeacion', label: 'Planeación', emoji: '📅', axis: 'operativo' },
  { type: 'prioridad_principal', label: 'Prioridad principal', emoji: '🎯', axis: 'operativo' },
  { type: 'enfoque', label: 'Enfoque / Pomodoro', emoji: '⏱️', axis: 'enfoque' },
  { type: 'descanso', label: 'Descanso o pausa', emoji: '🛑', axis: 'enfoque' },
];

const AXES = [
  { key: 'cuerpo', label: 'Cuerpo' },
  { key: 'emocion', label: 'Emoción' },
  { key: 'operativo', label: 'Operativo' },
  { key: 'enfoque', label: 'Enfoque' },
];

const MAX_CHECKINS_PER_DAY = 4;
const MAX_PRIORITIES = 4;

const axisOf = (type) => {
  if (type.startsWith('habito:')) return 'operativo';
  return CHECKIN_TYPES.find((c) => c.type === type)?.axis || null;
};

/** Semáforo metodológico a partir del índice (0-100) */
function semaforo(index) {
  if (index < 25) return { key: 'atencion', label: 'Atención', emoji: '🔴' };
  if (index < 50) return { key: 'construccion', label: 'Construcción', emoji: '🟡' };
  if (index < 75) return { key: 'sostenimiento', label: 'Sostenimiento', emoji: '🟢' };
  return { key: 'autonomia', label: 'Autonomía', emoji: '🔵' };
}

/**
 * Cuántas prioridades del día se recomiendan según el Índice de Sostenibilidad.
 * Principio de la metodología: con menos capacidad, menos carga.
 */
function maxPrioritiesFor(index) {
  if (index < 40) return 2;
  if (index < 70) return 3;
  return MAX_PRIORITIES;
}

/** Calcula el % (0-100) de cada anillo a partir de los check-ins y prioridades de hoy */
function computeRings(checkins, priorities) {
  const buckets = { cuerpo: [], emocion: [], operativo: [], enfoque: [] };
  for (const c of checkins) {
    const axis = axisOf(c.type);
    const n = Number(c.value);
    if (axis && Number.isFinite(n)) buckets[axis].push(Math.min(Math.max(n, 0), 5) * 20);
  }
  if (priorities.length) {
    const done = priorities.filter((p) => p.is_completed).length;
    buckets.operativo.push((done / priorities.length) * 100);
  }
  return AXES.map((a) => {
    const vals = buckets[a.key];
    const value = vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : 0;
    return { key: a.key, label: a.label, value };
  });
}

module.exports = {
  CHECKIN_TYPES, AXES, MAX_CHECKINS_PER_DAY, MAX_PRIORITIES,
  axisOf, semaforo, maxPrioritiesFor, computeRings,
};

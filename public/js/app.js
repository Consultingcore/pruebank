(() => {
  if (!NK.token()) { location.replace('/index.html'); return; }

  const $ = (id) => document.getElementById(id);
  const state = { data: null, phraseIdx: 0, pendingPhoto: null };
  const RING_COLORS = { cuerpo: '#7A5230', emocion: '#8C5A7A', operativo: '#1F3A5F', enfoque: '#2F7D5B' };
  const SCALE_LABELS = ['Muy bajo', 'Bajo', 'Medio', 'Bueno', 'Muy bueno'];

  // ---------- Utilidades de UI ----------
  let toastTimer;
  function toast(text) {
    const t = $('toast');
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
  }
  const fail = (err) => toast(err.message || 'Ocurrió un error');
  const photoKey = () => `nk_photo_${state.data.date}`;
  const skipKey = () => `nk_skip_photo_${state.data.date}`;

  // ---------- Carga inicial ----------
  async function load() {
    state.data = await NK.get('/api/dashboard');
    state.pendingPhoto = sessionStorage.getItem(photoKey());
    renderHeader();
    renderPriorities();
    renderPhrase();
    renderRings();
    renderCheckins();
    renderCheckins();
    // NUEVA LÍNEA ↓
    if (window.KokonChat) window.KokonChat.init();
    $('loading').hidden = true;
    $('app').hidden = false;
   
  }

  // ---------- Cabecera ----------
  function renderHeader() {
    const d = state.data;
    const hour = new Date().getHours();
    const saludo = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';
    const first = (d.user.name || d.user.email.split('@')[0]).split(' ')[0];
    $('greeting').textContent = `${saludo}, ${first}`;
    $('today').textContent = new Date(`${d.date}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
    const s = d.sustainability.semaforo;
    $('semBadge').className = `sem-badge sem-${s.key}`;
    $('semLabel').textContent = `${s.emoji} ${s.label}`;
    $('semBadge').title = `Índice de Sostenibilidad: ${d.sustainability.index}/100`;
  }

  // ---------- Slide 1: prioridades ----------
  function renderPriorities() {
    const { priorities, sustainability } = state.data;
    const box = $('priorities');
    box.replaceChildren();

    if (!priorities.length) {
      box.append(h('div', { class: 'card' }, h('p', { class: 'sub' }, 'Aún no defines tu prioridad de hoy. Elige lo más importante y empieza por ahí.')));
    }

    priorities.forEach((p, i) => {
      const tag = p.is_event ? (p.event_type === 'webinar' ? '📡 Webinar de hoy' : '🤝 Mentoría 1:1 de hoy') : `Prioridad ${i + 1}`;
      const check = h('button', {
        class: 'check', type: 'button', 'aria-pressed': String(p.is_completed),
        'aria-label': `${p.is_completed ? 'Desmarcar' : 'Completar'}: ${p.title}`,
        onclick: () => act(() => NK.patch(`/api/priorities/${p.id}/toggle`)),
      }, svgCheck());
      box.append(h('article', { class: `priority${i === 0 ? ' hero' : ''}${p.is_completed ? ' done' : ''}` },
        h('div', { class: 'p-body' }, h('span', { class: 'p-tag' }, tag), h('p', { class: 'p-title' }, p.title),
          !p.is_event && h('button', { class: 'p-remove', type: 'button', onclick: () => act(() => NK.del(`/api/priorities/${p.id}`)) }, 'Quitar')),
        check));
    });

    const canAdd = priorities.length < sustainability.maxPriorities;
    $('addForm').hidden = !canAdd;
    $('priorityHint').textContent = `Con tu índice de hoy (${sustainability.index}/100), tu sistema sostiene hasta ${sustainability.maxPriorities} prioridades.`;
  }

  function svgCheck() {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', 'M20 6L9 17l-5-5');
    svg.append(path);
    return svg;
  }

  async function act(fn) {
    try {
      const r = await fn();
      if (r.priorities) { state.data.priorities = r.priorities; }
      // El semáforo y los anillos dependen de las prioridades: refresca todo
      state.data = { ...(await NK.get('/api/dashboard')) };
      state.pendingPhoto = sessionStorage.getItem(photoKey());
      renderHeader(); renderPriorities(); renderRings(); renderCheckins();
    } catch (err) { fail(err); }
  }

  $('addForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = $('newPriority').value.trim();
    if (!title) return;
    await act(() => NK.post('/api/priorities', { title }));
    $('newPriority').value = '';
  });

  // ---------- Slide 2: frase ancla ----------
  function renderPhrase(direction = 0) {
    const { phrases, weeklyAnchor } = state.data;
    const list = weeklyAnchor ? [weeklyAnchor, ...phrases] : phrases;
    if (!list.length) return;
    state.phraseIdx = (state.phraseIdx + direction + list.length) % list.length;
    const q = $('phrase');
    q.classList.add('fade');
    setTimeout(() => {
      q.textContent = list[state.phraseIdx];
      $('phraseCount').textContent = `${state.phraseIdx + 1} / ${list.length}`;
      q.classList.remove('fade');
    }, direction ? 220 : 0);
  }
  $('phrasePrev').addEventListener('click', () => renderPhrase(-1));
  $('phraseNext').addEventListener('click', () => renderPhrase(1));

  // ---------- Slide 3: anillos concéntricos (SVG) ----------
  function renderRings() {
    const svg = $('rings');
    const ns = 'http://www.w3.org/2000/svg';
    svg.replaceChildren();
    const rings = state.data.rings;
    const stroke = 12, gap = 5, start = 86;
    rings.forEach((r, i) => {
      const radius = start - i * (stroke + gap);
      const circ = 2 * Math.PI * radius;
      const mk = (cls, extra) => {
        const c = document.createElementNS(ns, 'circle');
        c.setAttribute('cx', 100); c.setAttribute('cy', 100); c.setAttribute('r', radius);
        c.setAttribute('fill', 'none'); c.setAttribute('stroke-width', stroke); c.setAttribute('stroke-linecap', 'round');
        c.setAttribute('transform', 'rotate(-90 100 100)');
        Object.entries(extra).forEach(([k, v]) => c.setAttribute(k, v));
        return c;
      };
      svg.append(mk('track', { stroke: RING_COLORS[r.key], 'stroke-opacity': 0.16 }));
      if (r.value > 0) {
        svg.append(mk('val', { stroke: RING_COLORS[r.key], 'stroke-dasharray': `${(r.value / 100) * circ} ${circ}` }));
      }
    });
    svg.setAttribute('aria-label', 'Anillos de hoy: ' + rings.map((r) => `${r.label} ${r.value}%`).join(', '));

    const legend = $('ringsLegend');
    legend.replaceChildren(...rings.map((r) =>
      h('li', {}, h('i', { style: `background:${RING_COLORS[r.key]}`, 'aria-hidden': 'true' }), r.label, h('b', {}, `${r.value}%`))));
  }

  // ---------- Slide 3: check-ins ----------
  function renderCheckins() {
    const d = state.data;
    const needsPhoto = !d.hasPhotoToday && !state.pendingPhoto && !sessionStorage.getItem(skipKey());
    $('photoStep').hidden = !needsPhoto;
    $('checkinCard').hidden = needsPhoto;
    if (needsPhoto) return;

    const done = new Map(d.checkins.map((c) => [c.type, Number(c.value)]));
    const full = done.size >= d.maxCheckins;
    $('ciCounter').textContent = `${done.size} de ${d.maxCheckins} check-ins de hoy${full ? ' — ¡suficiente por hoy!' : ''}`;

    const rows = d.checkinTypes.map((t) => ({ type: t.type, label: t.label, emoji: t.emoji, habit: false }))
      .concat(d.habits.map((hb) => ({ type: `habito:${hb.id}`, label: hb.name, emoji: '🌱', habit: true })));

    $('checkins').replaceChildren(...rows.map((r) => {
      const current = done.get(r.type);
      const locked = full && current === undefined;
      let control;
      if (r.habit) {
        control = h('button', {
          class: 'habit-btn', type: 'button', 'aria-pressed': String(current !== undefined), disabled: locked,
          onclick: () => saveCheckin(r.type, 5),
        }, current !== undefined ? '✓ Hecho' : 'Marcar como hecho');
      } else {
        control = h('div', { class: 'scale', role: 'group', 'aria-label': `Nivel de ${r.label}` },
          [1, 2, 3, 4, 5].map((n) => h('button', {
            type: 'button', 'aria-pressed': String(current === n), 'aria-label': `${n} — ${SCALE_LABELS[n - 1]}`, disabled: locked,
            onclick: () => saveCheckin(r.type, n),
          }, String(n))));
      }
      return h('div', { class: 'ci' }, h('div', { class: 'ci-head' }, h('span', { class: 'emoji', 'aria-hidden': 'true' }, r.emoji), r.label), control);
    }));
  }

  async function saveCheckin(type, value) {
    try {
      const body = { type, value };
      if (state.pendingPhoto) body.photo_url = state.pendingPhoto;
      await NK.post('/api/checkins', body);
      sessionStorage.removeItem(photoKey());
      state.pendingPhoto = null;
      state.data = await NK.get('/api/dashboard');
      renderHeader(); renderPriorities(); renderRings(); renderCheckins();
    } catch (err) { fail(err); }
  }

  // Foto del espacio
  $('photoInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const prev = $('photoPreview');
    prev.src = URL.createObjectURL(file);
    prev.hidden = false;
    try {
      const fd = new FormData();
      fd.append('photo', file);
      const r = await NK.upload('/api/checkins/photo', fd);
      state.pendingPhoto = r.photo_url;
      sessionStorage.setItem(photoKey(), r.photo_url);
      toast('Foto guardada. Ya puedes hacer tu check-in.');
      renderCheckins();
    } catch (err) { prev.hidden = true; fail(err); }
  });
  $('photoLabel').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('photoInput').click(); } });
  $('photoSkip').addEventListener('click', () => { sessionStorage.setItem(skipKey(), '1'); renderCheckins(); });

  $('habitForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('newHabit').value.trim();
    if (!name) return;
    try {
      await NK.put('/api/dashboard/habits', { name });
      $('newHabit').value = '';
      state.data = await NK.get('/api/dashboard');
      renderCheckins();
    } catch (err) { fail(err); }
  });

  // ---------- Slides: puntos y navegación ----------
  const slidesEl = $('slides');
  const slideEls = [...slidesEl.querySelectorAll('.slide')];
  const names = ['Prioridades', 'Frase ancla', 'Check-ins'];
  const dots = $('dots');
  slideEls.forEach((s, i) => dots.append(h('button', {
    type: 'button', role: 'tab', 'aria-label': names[i], 'aria-current': i === 0 ? 'true' : 'false',
    onclick: () => goTo(i),
  }, h('span'))));

  function goTo(i) { slideEls[i].scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' }); }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) {
        const i = slideEls.indexOf(en.target);
        [...dots.children].forEach((b, j) => b.setAttribute('aria-current', String(i === j)));
      }
    });
  }, { root: slidesEl, threshold: 0.6 });
  slideEls.forEach((s) => io.observe(s));

  document.addEventListener('keydown', (e) => {
    if (/INPUT|TEXTAREA/.test(document.activeElement.tagName) || $('drawer').classList.contains('open')) return;
    const cur = slideEls.findIndex((s) => Math.abs(s.getBoundingClientRect().left) < 5);
    if (e.key === 'ArrowRight' && cur < slideEls.length - 1) goTo(cur + 1);
    if (e.key === 'ArrowLeft' && cur > 0) goTo(cur - 1);
  });

  // ---------- Menú lateral ----------
  const MENU = [
    { label: 'Inicio', sub: 'Mapa de Sueños', action: () => goTo(0) },
    { label: 'Asistente Kokón', sub: 'Conversación con IA', action: () => openChat() },  // ← NUEVO
    { label: 'Salón de Mentoría', sub: 'Videollamada 1:1 (Cal.com)', soon: true },
    { label: 'Webinars', sub: 'Calendario y eventos en vivo', soon: true },
    { label: 'Herramientas', sub: 'S-MART, Árbol de Problemas, Pareto…', soon: true },
    { label: 'Materiales', sub: 'Videos, podcasts, kits y tienda', soon: true },
    { label: 'Comunidad', sub: 'Muro social', soon: true },
  ];
  $('menuNav').append(...MENU.map((m, i) => h('button', {
    type: 'button', 'aria-current': i === 0 ? 'page' : null,
    onclick: () => { closeMenu(); if (m.soon) toast(`${m.label} estará disponible en la siguiente fase.`); else m.action(); },
  }, m.label, h('small', {}, m.sub))));

  let lastFocus;
  function openMenu() {
    lastFocus = document.activeElement;
    $('drawer').classList.add('open'); $('overlay').classList.add('show');
    $('drawer').setAttribute('aria-hidden', 'false'); $('menuBtn').setAttribute('aria-expanded', 'true');
    $('closeMenu').focus();
  }
  function closeMenu() {
    $('drawer').classList.remove('open'); $('overlay').classList.remove('show');
    $('drawer').setAttribute('aria-hidden', 'true'); $('menuBtn').setAttribute('aria-expanded', 'false');
    lastFocus?.focus();
  }
  $('menuBtn').addEventListener('click', openMenu);
  $('closeMenu').addEventListener('click', closeMenu);
  $('overlay').addEventListener('click', closeMenu);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('drawer').classList.contains('open')) closeMenu(); });
  $('logout').addEventListener('click', () => { NK.clearSession(); location.href = '/index.html'; });
  // ---------- Vista del chat ----------
  function openChat() {
    closeMenu();
    const existing = $('chatView');
    if (existing) return;

    const view = h('section', { class: 'slide', id: 'chatView', 'aria-label': 'Asistente Kokón' },
      h('div', { class: 'slide-inner' },
        h('div', { class: 'chat-shell' },
          h('div', { class: 'chat-head' },
            h('span', { class: 'dot' }),
            h('strong', {}, 'Asistente Kokón'),
            h('small', {}, 'En línea'),
            h('button', { type: 'button', id: 'chatNew', title: 'Nueva conversación' }, 'Nueva'),
            h('button', { type: 'button', onclick: closeChat, 'aria-label': 'Cerrar chat' }, '✕'),
          ),
          h('div', { class: 'chat-messages', id: 'chatMessages' }),
          h('div', { class: 'chat-input-row' },
            h('input', { type: 'text', id: 'chatInput', placeholder: 'Escribe lo que sientes o piensas…', autocomplete: 'off' }),
            h('button', { class: 'chat-send', id: 'chatSend', type: 'button', 'aria-label': 'Enviar' },
              svgSend(),
            ),
          ),
        ),
      ),
    );
    // Inserta el chat al principio del contenedor de slides
    $('slides').insertBefore(view, $('slides').firstChild);
    view.scrollIntoView({ behavior: 'smooth', inline: 'start' });
    if (window.KokonChat) window.KokonChat.init();
  }

  function closeChat() {
    const v = $('chatView');
    if (v) v.remove();
    if (window.KokonChat) window.KokonChat.destroy();
  }

  function svgSend() {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', 'M2 21l21-9L2 3v7l15 2-15 2v7z');
    svg.append(path);
    return svg;
  }
  load().catch((err) => {
    $('loading').textContent = err.message || 'No pudimos cargar tu espacio.';
  });
})();

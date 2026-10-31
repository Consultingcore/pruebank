(() => {
  // Si ya hay sesión, entra directo
  if (NK.token()) { location.replace('/app.html'); return; }

  const views = ['login', 'register', 'forgot', 'reset'];
  const msgBox = document.getElementById('msg');
  const params = new URLSearchParams(location.search);
  const resetToken = params.get('reset');

  function show(name) {
    views.forEach((v) => (document.getElementById(`view-${v}`).hidden = v !== name));
    msg();
  }
  function msg(text, kind = 'error') {
    msgBox.replaceChildren();
    if (text) msgBox.append(h('div', { class: `msg msg-${kind}` }, text));
  }
  const busy = (form, on) => form.querySelectorAll('button[type=submit]').forEach((b) => (b.disabled = on));
  const val = (id) => document.getElementById(id).value.trim();

  document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => show(b.dataset.go)));

  async function submit(form, fn) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      msg();
      busy(form, true);
      try { await fn(); } catch (err) { msg(err.message); } finally { busy(form, false); }
    });
  }
  const enter = (session) => { NK.setSession(session); location.href = '/app.html'; };

  submit(document.getElementById('form-login'), async () => {
    enter(await NK.post('/api/auth/login', { email: val('l-email'), password: document.getElementById('l-pass').value }));
  });

  submit(document.getElementById('form-register'), async () => {
    enter(await NK.post('/api/auth/register', {
      name: val('r-name'), email: val('r-email'), password: document.getElementById('r-pass').value,
    }));
  });

  submit(document.getElementById('form-forgot'), async () => {
    const r = await NK.post('/api/auth/forgot', { email: val('f-email') });
    msg(r.message, 'ok');
    // Solo en desarrollo (sin SMTP) el servidor devuelve el enlace para probar el flujo
    if (r.devLink) msgBox.append(h('div', { class: 'msg msg-info' }, 'Modo desarrollo: ', h('a', { href: r.devLink }, r.devLink)));
  });

  submit(document.getElementById('form-reset'), async () => {
    const r = await NK.post('/api/auth/reset', { token: resetToken, password: document.getElementById('n-pass').value });
    history.replaceState(null, '', '/index.html');
    show('login');
    msg(r.message, 'ok');
  });

  // ---- Google Identity Services ----
  async function initGoogle() {
    let cfg;
    try { cfg = await NK.get('/api/auth/config'); } catch { return; }
    if (!cfg.googleClientId) return;
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => {
      google.accounts.id.initialize({
        client_id: cfg.googleClientId,
        callback: async (resp) => {
          try { enter(await NK.post('/api/auth/google', { credential: resp.credential })); }
          catch (err) { msg(err.message); }
        },
      });
      google.accounts.id.renderButton(document.getElementById('googleBtn'), { theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', locale: 'es' });
      document.getElementById('googleBtn').hidden = false;
      document.getElementById('google-divider').hidden = false;
    };
    document.head.append(s);
  }

  show(resetToken ? 'reset' : 'login');
  initGoogle();
})();

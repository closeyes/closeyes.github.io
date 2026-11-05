let csrf = '';
const $ = (t, a = {}, ...c) => { const e = Object.assign(document.createElement(t), a); e.append(...c); return e; };
async function api(path, data) {
  const r = await fetch('/api/' + path, data === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify(data) });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(j.error || r.statusText), { status: r.status }); return j;
}
const app = document.getElementById('app');
function loginView() {
  const u = $('input', { placeholder: 'User ID', autocomplete: 'username' }), p = $('input', { type: 'password', placeholder: 'Password', autocomplete: 'current-password' }), err = $('p', { className: 'err' });
  const go = async () => { try { await api('login', { username: u.value, password: p.value }); start(); } catch (e) { err.textContent = e.message; } };
  p.onkeydown = e => e.key === 'Enter' && go();
  app.replaceChildren($('h1', {}, 'Log in'), u, p, $('button', { onclick: go }, 'Log in'), err);
}
function ratingBar(file, info, label) {
  const fill = $('div', { className: 'fill' }), bar = $('div', { className: 'bar' }, fill);
  const show = v => { fill.style.width = (v ?? 0) * 10 + '%'; label.textContent = v == null ? 'Not rated' : 'Your rating: ' + v.toFixed(1) + ' / 10'; };
  const calc = e => { const r = bar.getBoundingClientRect(); return Math.round(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * 100) / 10; };
  bar.onpointerdown = async e => {
    const v = calc(e); show(v);
    try { const res = await api('rate', { file, rating: v }); info.textContent = res.avg == null ? '' : 'Average: ' + res.avg.toFixed(1); } catch (x) { label.textContent = x.message; }
  };
  return { bar, show };
}
async function filesView(me) {
  const files = await api('files');
  const nav = $('p', {}, 'Signed in as ' + me.username + ' ');
  if (me.role === 'admin') nav.append($('a', { href: '/admin' }, 'Admin page'), ' ');
  nav.append($('button', { onclick: async () => { await api('logout', {}); loginView(); } }, 'Log out'));
  app.replaceChildren($('h1', {}, 'Files'), nav);
  if (!files.length) app.append($('p', {}, 'No files available to you.'));
  for (const f of files) {
    const url = '/files/' + encodeURIComponent(f.name), isPdf = /\.pdf$/i.test(f.name);
    const label = $('div'), info = $('div', {}, f.avg == null ? '' : 'Average: ' + f.avg.toFixed(1));
    const rb = ratingBar(f.name, info, label); rb.show(f.mine);
    app.append($('div', { className: 'card' }, $('strong', {}, f.name), isPdf ? $('embed', { src: url, type: 'application/pdf', width: '100%', height: '420' }) : $('img', { src: url, alt: f.name }), $('a', { href: url, target: '_blank' }, 'Open'), rb.bar, label, info));
  }
}
async function start() { try { const me = await api('me'); csrf = me.csrf; await filesView(me); } catch { loginView(); } }
start();

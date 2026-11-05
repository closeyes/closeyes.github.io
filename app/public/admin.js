let csrf = '';
const $ = (t, a = {}, ...c) => { const e = Object.assign(document.createElement(t), a); e.append(...c); return e; };
const err = document.getElementById('err');
const nameI = document.getElementById('name'), pwI = document.getElementById('pw'), roleI = document.getElementById('role');
async function api(path, data) {
  const r = await fetch('/api/' + path, data === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify(data) });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || r.statusText); return j;
}
const guard = fn => async (...a) => { err.textContent = ''; try { await fn(...a); } catch (e) { err.textContent = e.message; } };
let allFiles = [];
function boxes(sel = []) {
  const box = document.getElementById('fileboxes'); box.replaceChildren();
  for (const f of allFiles) box.append($('label', {}, $('input', { type: 'checkbox', value: f, checked: sel.includes(f) }), ' ' + f + ' '));
}
const checked = () => [...document.querySelectorAll('#fileboxes input:checked')].map(i => i.value);
const load = guard(async () => {
  const me = await api('me'); csrf = me.csrf;
  const d = await api('admin/users'); allFiles = d.files; boxes();
  const t = $('table', {}, $('tr', {}, ...['User', 'Role', 'Files', ''].map(h => $('th', {}, h))));
  for (const u of d.users) t.append($('tr', {}, $('td', {}, u.name), $('td', {}, u.role), $('td', {}, u.role === 'admin' ? 'all' : u.files.join(', ')),
    $('td', {}, $('button', { onclick: () => { nameI.value = u.name; roleI.value = u.role; boxes(u.files); } }, 'Edit'),
      u.name === 'closeyes' ? '' : $('button', { onclick: guard(async () => { if (confirm('Delete ' + u.name + '?')) { await api('admin/delete', { name: u.name }); load(); } }) }, 'Delete'))));
  document.getElementById('users').replaceChildren(t);
  const r = await api('admin/ratings'), rd = document.getElementById('ratings'); rd.replaceChildren();
  for (const f of r) rd.append($('p', {}, `${f.name}: avg ${f.avg ?? '-'} `, Object.entries(f.ratings).map(([u, v]) => `${u}=${v}`).join(', ')));
});
document.getElementById('form').onsubmit = guard(async e => {
  e.preventDefault();
  await api('admin/user', { name: nameI.value, password: pwI.value || undefined, role: roleI.value, files: checked() });
  pwI.value = ''; load();
});
load();

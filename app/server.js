// Zero-dependency login / file-rating server. Run: ADMIN_PASSWORD=... node app/server.js
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const PORT = process.env.PORT || 3000;
const DATA = path.join(__dirname, 'data'), FILES = path.join(DATA, 'files'), PUB = path.join(__dirname, 'public');
const USERS_F = path.join(DATA, 'users.json'), RATINGS_F = path.join(DATA, 'ratings.json');
const ADMIN = 'closeyes';
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.pdf': 'application/pdf', '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const ALLOWED_EXT = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.pdf'];

fs.mkdirSync(FILES, { recursive: true });
const load = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const save = (f, o) => { fs.writeFileSync(f + '.tmp', JSON.stringify(o, null, 2)); fs.renameSync(f + '.tmp', f); };
let users = load(USERS_F, {}), ratings = load(RATINGS_F, {});

const hash = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString('hex');
function makeUser(pw, role, files) { const salt = crypto.randomBytes(16).toString('hex'); return { salt, hash: hash(pw, salt), role, files: files || [] }; }
function checkPw(u, pw) { const a = Buffer.from(hash(pw, u.salt), 'hex'), b = Buffer.from(u.hash, 'hex'); return crypto.timingSafeEqual(a, b); }

if (!users[ADMIN]) {
  const pw = process.env.ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');
  if (!process.env.ADMIN_PASSWORD) console.log(`Generated admin password for "${ADMIN}": ${pw}`);
  users[ADMIN] = makeUser(pw, 'admin'); save(USERS_F, users);
}

const sessions = new Map(); // token -> {user, csrf, exp}
const TTL = 8 * 3600e3;
const fails = new Map(); // ip -> {n, until}

const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
const body = req => new Promise((ok, no) => { let s = ''; req.on('data', c => { s += c; if (s.length > 1e5) { req.destroy(); no(new Error('big')); } }); req.on('end', () => { try { ok(s ? JSON.parse(s) : {}); } catch (e) { no(e); } }); });
function session(req) {
  const m = /(?:^|; )sid=([^;]+)/.exec(req.headers.cookie || ''); const s = m && sessions.get(m[1]);
  if (!s) return null; if (s.exp < Date.now()) { sessions.delete(m[1]); return null; }
  return users[s.user] ? { ...s, token: m[1] } : null;
}
const listFiles = () => fs.readdirSync(FILES).filter(f => ALLOWED_EXT.includes(path.extname(f).toLowerCase()));
const canSee = (u, f) => u.role === 'admin' || u.files.includes(f);
const avg = f => { const v = Object.values(ratings[f] || {}); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length * 10) / 10 : null; };

async function api(req, res, url) {
  const route = req.method + ' ' + url.pathname;
  if (route === 'POST /api/login') {
    const ip = req.socket.remoteAddress, f = fails.get(ip);
    if (f && f.until > Date.now()) return send(res, 429, { error: 'Too many attempts, try later' });
    const { username, password } = await body(req);
    const u = typeof username === 'string' && Object.hasOwn(users, username) ? users[username] : null;
    if (!u || typeof password !== 'string' || !checkPw(u, password)) {
      const n = (f ? f.n : 0) + 1; fails.set(ip, { n, until: n >= 5 ? Date.now() + 60e3 : 0 });
      return send(res, 401, { error: 'Invalid credentials' });
    }
    fails.delete(ip);
    const token = crypto.randomBytes(32).toString('hex'), csrf = crypto.randomBytes(16).toString('hex');
    sessions.set(token, { user: username, csrf, exp: Date.now() + TTL });
    res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${TTL / 1000}`);
    return send(res, 200, { ok: true });
  }
  const s = session(req);
  if (!s) return send(res, 401, { error: 'Not logged in' });
  const me = users[s.user];
  if (req.method !== 'GET' && req.headers['x-csrf-token'] !== s.csrf) return send(res, 403, { error: 'Bad CSRF token' });

  if (route === 'GET /api/me') return send(res, 200, { username: s.user, role: me.role, csrf: s.csrf });
  if (route === 'POST /api/logout') { sessions.delete(s.token); res.setHeader('Set-Cookie', 'sid=; Max-Age=0; Path=/'); return send(res, 200, { ok: true }); }
  if (route === 'POST /api/password') {
    const { password } = await body(req);
    if (typeof password !== 'string' || password.length < 8) return send(res, 400, { error: 'Password must be 8+ chars' });
    users[s.user] = { ...me, ...makeUser(password, me.role, me.files) }; save(USERS_F, users); return send(res, 200, { ok: true });
  }
  if (route === 'GET /api/files') {
    return send(res, 200, listFiles().filter(f => canSee(me, f)).map(f => ({ name: f, mine: (ratings[f] || {})[s.user] ?? null, avg: avg(f) })));
  }
  if (route === 'POST /api/rate') {
    const { file, rating } = await body(req);
    if (typeof file !== 'string' || !listFiles().includes(file) || !canSee(me, file)) return send(res, 404, { error: 'No such file' });
    if (typeof rating !== 'number' || !(rating >= 0 && rating <= 10)) return send(res, 400, { error: 'Rating must be 0-10' });
    (ratings[file] ||= {})[s.user] = Math.round(rating * 10) / 10; save(RATINGS_F, ratings);
    return send(res, 200, { mine: ratings[file][s.user], avg: avg(file) });
  }

  if (url.pathname.startsWith('/api/admin/')) {
    if (me.role !== 'admin') return send(res, 403, { error: 'Admin only' });
    if (route === 'GET /api/admin/users') {
      return send(res, 200, { files: listFiles(), users: Object.entries(users).map(([name, u]) => ({ name, role: u.role, files: u.files })) });
    }
    if (route === 'POST /api/admin/user') { // create or update
      const { name, password, role, files } = await body(req);
      if (typeof name !== 'string' || !/^[A-Za-z0-9_.-]{2,32}$/.test(name)) return send(res, 400, { error: 'Invalid username' });
      const exists = Object.hasOwn(users, name);
      if (!exists && (typeof password !== 'string' || password.length < 8)) return send(res, 400, { error: 'Password must be 8+ chars' });
      if (password && (typeof password !== 'string' || password.length < 8)) return send(res, 400, { error: 'Password must be 8+ chars' });
      if (name === ADMIN && role && role !== 'admin') return send(res, 400, { error: 'Cannot demote ' + ADMIN });
      const r = name === ADMIN || role === 'admin' ? 'admin' : 'user';
      const fl = Array.isArray(files) ? files.filter(f => typeof f === 'string' && listFiles().includes(f)) : (exists ? users[name].files : []);
      users[name] = exists ? { ...users[name], role: r, files: fl } : makeUser(password, r, fl);
      if (exists && password) users[name] = makeUser(password, r, fl);
      save(USERS_F, users); return send(res, 200, { ok: true });
    }
    if (route === 'POST /api/admin/delete') {
      const { name } = await body(req);
      if (name === ADMIN || typeof name !== 'string' || !Object.hasOwn(users, name)) return send(res, 400, { error: 'Cannot delete' });
      delete users[name]; for (const [t, x] of sessions) if (x.user === name) sessions.delete(t);
      for (const f of Object.keys(ratings)) delete ratings[f][name];
      save(USERS_F, users); save(RATINGS_F, ratings); return send(res, 200, { ok: true });
    }
    if (route === 'GET /api/admin/ratings') {
      return send(res, 200, listFiles().map(f => ({ name: f, avg: avg(f), ratings: ratings[f] || {} })));
    }
  }
  send(res, 404, { error: 'Not found' });
}

function serveFile(res, p, extra) {
  fs.readFile(p, (e, d) => {
    if (e) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p).toLowerCase()] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; img-src 'self'; style-src 'self'; script-src 'self'; object-src 'self'; frame-ancestors 'self'", ...extra });
    res.end(d);
  });
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (url.pathname.startsWith('/files/')) {
      const s = session(req), name = decodeURIComponent(url.pathname.slice(7));
      if (!s || !listFiles().includes(name) || !canSee(users[s.user], name)) { res.writeHead(403); return res.end('Forbidden'); }
      return serveFile(res, path.join(FILES, name), { 'Cache-Control': 'private, no-store' });
    }
    const pages = { '/': 'index.html', '/admin': 'admin.html' };
    const rel = pages[url.pathname] || url.pathname.slice(1);
    const p = path.join(PUB, rel);
    if (!p.startsWith(PUB + path.sep)) { res.writeHead(403); return res.end(); }
    serveFile(res, p, {});
  } catch (e) { send(res, 400, { error: 'Bad request' }); }
}).listen(PORT, () => console.log('Listening on http://localhost:' + PORT));

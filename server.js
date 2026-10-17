const express = require('express');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const sec = require('./lib/security');
const { syncAll, CATEGORIES } = require('./lib/n8n-sync');

const { PORT = 3000, DATABASE_URL, DASHBOARD_SECRET, ADMIN_PASSWORD, NODE_ENV } = process.env;
if (!DATABASE_URL || !DASHBOARD_SECRET || !ADMIN_PASSWORD) {
  console.error('Missing env: DATABASE_URL, DASHBOARD_SECRET and ADMIN_PASSWORD are required.');
  process.exit(1);
}
const PROD = NODE_ENV === 'production';
const SYNC_MIN = Number(process.env.SYNC_INTERVAL_MINUTES || 5);

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 5,
});
// Day buckets in the chart follow this timezone (e.g. Australia/Adelaide).
const TZ = process.env.DASHBOARD_TIMEZONE || 'UTC';
try { new Intl.DateTimeFormat('en', { timeZone: TZ }); } catch { console.error('Invalid DASHBOARD_TIMEZONE'); process.exit(1); }
pool.on('connect', c => c.query(`SET TIME ZONE '${TZ.replace(/'/g, '')}'`).catch(() => {}));

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '100kb' }));
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': process.env.ALLOW_FRAME_FROM ? 'SAMEORIGIN' : 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' https://fonts.googleapis.com; style-src-attr 'unsafe-inline'; font-src https://fonts.gstatic.com; frame-ancestors " + (process.env.ALLOW_FRAME_FROM || "'none'"),
  });
  if (PROD) res.set('Strict-Transport-Security', 'max-age=31536000');
  next();
});

// ---------- tiny in-memory rate limiter ----------
const buckets = new Map();
function limit(key, max, windowMs) {
  const now = Date.now();
  const b = buckets.get(key) || { n: 0, reset: now + windowMs };
  if (now > b.reset) { b.n = 0; b.reset = now + windowMs; }
  b.n++; buckets.set(key, b);
  return b.n <= max;
}
setInterval(() => { const now = Date.now(); for (const [k, b] of buckets) if (now > b.reset) buckets.delete(k); }, 60e3).unref();

// ---------- auth ----------
const COOKIE = 'dash_session';
function getCookie(req, name) {
  const m = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(name + '='));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : null;
}
function setSession(res, payload) {
  const v = sec.signSession(payload);
  res.setHeader('Set-Cookie', `${COOKIE}=${v}; HttpOnly; Path=/; Max-Age=43200; SameSite=Lax${PROD ? '; Secure' : ''}`);
}
function auth(req, res, next) {
  const s = sec.readSession(getCookie(req, COOKIE));
  if (!s) return res.status(401).json({ error: 'Not signed in' });
  req.user = s; next();
}
const adminOnly = (req, res, next) => req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Admin only' });

// For admin: optional ?client=<id>; for clients: always their own id.
function scope(req) {
  if (req.user.role === 'client') return req.user.clientId;
  const c = parseInt(req.query.client, 10);
  return Number.isFinite(c) ? c : null;
}

// Only failed attempts count toward the lockout (10 per 15 min per IP).
const failedLogin = (req, res) => { limit('login:' + req.ip, Infinity, 15 * 60e3); return res.status(401).json({ error: 'Invalid credentials' }); };
app.post('/auth/login', async (req, res) => {
  const b = buckets.get('login:' + req.ip);
  if (b && Date.now() < b.reset && b.n >= 10) return res.status(429).json({ error: 'Too many attempts, try again later' });
  const { username = '', password = '' } = req.body || {};
  const u = String(username).trim().toLowerCase();
  if (u === 'admin') {
    if (!sec.safeEqualStr(password, ADMIN_PASSWORD)) return failedLogin(req, res);
    setSession(res, { role: 'admin', name: 'Admin' });
    return res.json({ ok: true });
  }
  const { rows } = await pool.query('SELECT id, name, password_hash FROM dash_clients WHERE slug=$1', [u]);
  if (!rows[0] || !sec.verifyPassword(String(password), rows[0].password_hash)) return failedLogin(req, res);
  setSession(res, { role: 'client', clientId: rows[0].id, name: rows[0].name });
  res.json({ ok: true });
});
app.post('/auth/logout', (req, res) => {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${PROD ? '; Secure' : ''}`);
  res.json({ ok: true });
});
app.get('/api/me', auth, (req, res) => res.json(req.user));

// ---------- dashboard data ----------
app.get('/api/summary', auth, async (req, res, next) => {
  try {
    const cid = scope(req);
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 7, 1), 90);
    const p = [days, cid];
    const execWhere = `e.started_at >= now() - ($1 || ' days')::interval AND ($2::int IS NULL OR e.client_id = $2)`;
    const evWhere = `v.created_at >= now() - ($1 || ' days')::interval AND ($2::int IS NULL OR v.client_id = $2)`;

    const [k, daily, cat, chan, wf, ev] = await Promise.all([
      pool.query(`SELECT count(*)::int runs,
                    count(*) FILTER (WHERE status='success')::int success,
                    count(*) FILTER (WHERE status IN ('error','crashed'))::int failed,
                    round(avg(duration_ms))::int avg_ms
                  FROM dash_executions e WHERE ${execWhere}`, p),
      pool.query(`SELECT to_char(d, 'YYYY-MM-DD') AS day,
                    count(e.*) FILTER (WHERE e.status='success')::int success,
                    count(e.*) FILTER (WHERE e.status IN ('error','crashed'))::int failed
                  FROM generate_series(date_trunc('day', now()) - (($1::int - 1) || ' days')::interval, date_trunc('day', now()), '1 day') d
                  LEFT JOIN dash_executions e ON date_trunc('day', e.started_at) = d AND ($2::int IS NULL OR e.client_id = $2)
                  GROUP BY d ORDER BY d`, p),
      pool.query(`SELECT c.category,
                    coalesce(x.runs,0)::int runs, coalesce(x.failed,0)::int failed, coalesce(y.events,0)::int events
                  FROM unnest($3::text[]) AS c(category)
                  LEFT JOIN (SELECT coalesce(w.category,'workflow') category, count(*) runs,
                               count(*) FILTER (WHERE e.status IN ('error','crashed')) failed
                             FROM dash_executions e LEFT JOIN dash_workflows w ON w.client_id=e.client_id AND w.n8n_id=e.workflow_id
                             WHERE ${execWhere} GROUP BY 1) x ON x.category=c.category
                  LEFT JOIN (SELECT category, count(*) events FROM dash_events v WHERE ${evWhere} GROUP BY 1) y ON y.category=c.category
                  ORDER BY array_position($3::text[], c.category)`,
        [...p, CATEGORIES]),
      pool.query(`SELECT coalesce(channel,'other') channel, count(*)::int events, sum(value)::float total,
                    count(*) FILTER (WHERE status<>'success')::int failed
                  FROM dash_events v WHERE ${evWhere} GROUP BY 1 ORDER BY 2 DESC LIMIT 12`, p),
      pool.query(`SELECT count(*) FILTER (WHERE active)::int active, count(*)::int total
                  FROM dash_workflows WHERE ($1::int IS NULL OR client_id=$1)`, [cid]),
      pool.query(`SELECT count(*)::int events FROM dash_events v WHERE ${evWhere}`, p),
    ]);

    let clients = [];
    if (req.user.role === 'admin') {
      clients = (await pool.query(
        `SELECT c.id, c.slug, c.name, c.segment, c.n8n_url IS NOT NULL AND c.n8n_api_key_enc IS NOT NULL n8n_connected,
                c.last_sync_at, c.last_sync_error,
                count(e.*)::int runs,
                count(e.*) FILTER (WHERE e.status IN ('error','crashed'))::int failed,
                max(e.started_at) last_run,
                (SELECT count(*) FROM dash_workflows w WHERE w.client_id=c.id AND w.active)::int active_workflows
         FROM dash_clients c
         LEFT JOIN dash_executions e ON e.client_id=c.id AND e.started_at >= now() - ($1 || ' days')::interval
         GROUP BY c.id ORDER BY failed DESC, runs DESC, c.name`, [days])).rows;
    }

    const kp = k.rows[0];
    res.json({
      days,
      kpis: { ...kp, success_rate: kp.runs ? kp.success / kp.runs : null, events: ev.rows[0].events,
              active_workflows: wf.rows[0].active, total_workflows: wf.rows[0].total },
      daily: daily.rows, byCategory: cat.rows, byChannel: chan.rows, clients,
    });
  } catch (e) { next(e); }
});

app.get('/api/executions', auth, async (req, res, next) => {
  try {
    const cid = scope(req);
    const status = req.query.status === 'failed' ? ['error', 'crashed'] : null;
    const { rows } = await pool.query(
      `SELECT e.n8n_id, e.status, e.mode, e.started_at, e.duration_ms, c.name client, c.slug,
              coalesce(w.name, 'Workflow ' || e.workflow_id) workflow, coalesce(w.category,'workflow') category,
              CASE WHEN $3 THEN c.n8n_url ELSE NULL END n8n_url, e.workflow_id
       FROM dash_executions e JOIN dash_clients c ON c.id=e.client_id
       LEFT JOIN dash_workflows w ON w.client_id=e.client_id AND w.n8n_id=e.workflow_id
       WHERE ($1::int IS NULL OR e.client_id=$1) AND ($2::text[] IS NULL OR e.status = ANY($2))
       ORDER BY e.started_at DESC NULLS LAST LIMIT 50`,
      [cid, status, req.user.role === 'admin']);
    res.json(rows);
  } catch (e) { next(e); }
});

app.get('/api/events', auth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT v.id, v.workflow, v.category, v.channel, v.status, v.metric, v.value::float value, v.created_at, c.name client
       FROM dash_events v JOIN dash_clients c ON c.id=v.client_id
       WHERE ($1::int IS NULL OR v.client_id=$1) ORDER BY v.created_at DESC LIMIT 50`, [scope(req)]);
    res.json(rows);
  } catch (e) { next(e); }
});

// ---------- ingest: n8n workflows push business outcomes here ----------
// POST /api/ingest   Authorization: Bearer <client ingest token>
// { "workflow": "WhatsApp order bot", "category": "integration", "channel": "whatsapp",
//   "status": "success", "metric": "messages_sent", "value": 12, "meta": { ... } }
// Also accepts an array of up to 100 such objects.
app.post('/api/ingest', async (req, res, next) => {
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: 'Missing bearer token' });
    if (!limit('ingest:' + sec.sha256(token).slice(0, 16), 600, 60e3)) return res.status(429).json({ error: 'Rate limited' });
    const { rows } = await pool.query('SELECT id FROM dash_clients WHERE ingest_token_hash=$1', [sec.sha256(token)]);
    if (!rows[0]) return res.status(401).json({ error: 'Invalid token' });

    const items = Array.isArray(req.body) ? req.body : [req.body];
    if (!items.length || items.length > 100) return res.status(400).json({ error: 'Send 1-100 events' });
    const str = (v, n = 120) => v == null ? null : String(v).slice(0, n);
    for (const it of items) {
      const category = CATEGORIES.includes(String(it.category).toLowerCase()) ? String(it.category).toLowerCase() : 'workflow';
      const value = Number.isFinite(Number(it.value)) ? Number(it.value) : 1;
      // Never store raw payloads: meta is truncated and should hold counts/ids, not customer PII.
      const meta = it.meta && typeof it.meta === 'object' ? JSON.stringify(it.meta).slice(0, 2000) : null;
      await pool.query(
        `INSERT INTO dash_events (client_id, workflow, category, channel, status, metric, value, meta)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
        [rows[0].id, str(it.workflow), category, str(it.channel, 40)?.toLowerCase(), str(it.status, 20) || 'success',
         str(it.metric, 60), value, meta && meta.endsWith('}') ? meta : null]);
    }
    res.json({ ok: true, stored: items.length });
  } catch (e) { next(e); }
});

// ---------- admin: client management ----------
app.get('/api/clients', auth, adminOnly, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, slug, name, segment, n8n_url, n8n_api_key_enc IS NOT NULL has_api_key,
            password_hash IS NOT NULL has_login, ingest_token_hash IS NOT NULL has_ingest_token,
            last_sync_at, last_sync_error, created_at FROM dash_clients ORDER BY name`);
  res.json(rows);
});

app.post('/api/clients', auth, adminOnly, async (req, res, next) => {
  try {
    const { name, slug, segment = 'SMB', n8n_url, n8n_api_key } = req.body || {};
    const s = String(slug || name || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!name || !s || s === 'admin') return res.status(400).json({ error: 'Name and a valid slug are required' });
    const password = sec.randomToken(12), ingestToken = sec.randomToken(32);
    const { rows } = await pool.query(
      `INSERT INTO dash_clients (slug, name, segment, n8n_url, n8n_api_key_enc, password_hash, ingest_token_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, slug`,
      [s, name, segment, n8n_url || null, sec.encrypt(n8n_api_key), sec.hashPassword(password), sec.sha256(ingestToken)]);
    if (n8n_url && n8n_api_key) syncAll(pool, rows[0].id).catch(() => {});
    res.json({ ...rows[0], login: { username: s, password }, ingestToken, note: 'Shown once. Store these securely.' });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'That slug already exists' });
    next(e);
  }
});

app.patch('/api/clients/:id', auth, adminOnly, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const b = req.body || {}, out = {};
    if (b.name) await pool.query('UPDATE dash_clients SET name=$2 WHERE id=$1', [id, b.name]);
    if (b.segment) await pool.query('UPDATE dash_clients SET segment=$2 WHERE id=$1', [id, b.segment]);
    if (b.n8n_url !== undefined) await pool.query('UPDATE dash_clients SET n8n_url=$2 WHERE id=$1', [id, b.n8n_url || null]);
    if (b.n8n_api_key) await pool.query('UPDATE dash_clients SET n8n_api_key_enc=$2 WHERE id=$1', [id, sec.encrypt(b.n8n_api_key)]);
    if (b.resetPassword) {
      out.password = sec.randomToken(12);
      await pool.query('UPDATE dash_clients SET password_hash=$2 WHERE id=$1', [id, sec.hashPassword(out.password)]);
    }
    if (b.rotateIngestToken) {
      out.ingestToken = sec.randomToken(32);
      await pool.query('UPDATE dash_clients SET ingest_token_hash=$2 WHERE id=$1', [id, sec.sha256(out.ingestToken)]);
    }
    res.json({ ok: true, ...out });
  } catch (e) { next(e); }
});

app.delete('/api/clients/:id', auth, adminOnly, async (req, res) => {
  await pool.query('DELETE FROM dash_clients WHERE id=$1', [parseInt(req.params.id, 10)]);
  res.json({ ok: true });
});

app.post('/api/sync', auth, adminOnly, async (req, res, next) => {
  try { res.json(await syncAll(pool, req.body?.clientId)); } catch (e) { next(e); }
});

// ---------- static + health ----------
app.get('/healthz', async (req, res) => {
  try { await pool.query('SELECT 1'); res.json({ ok: true }); } catch { res.status(503).json({ ok: false }); }
});
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'], maxAge: PROD ? '1h' : 0 }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

// ---------- boot ----------
(async () => {
  await pool.query(fs.readFileSync(path.join(__dirname, 'db/schema.sql'), 'utf8'));
  app.listen(PORT, () => console.log(`Dashboard on :${PORT}`));
  const tick = () => syncAll(pool).then(r => r.length && console.log('sync', JSON.stringify(r))).catch(e => console.error('sync failed', e.message));
  setTimeout(tick, 5e3);
  setInterval(tick, SYNC_MIN * 60e3);
})().catch(e => { console.error(e); process.exit(1); });

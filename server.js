const express = require('express');
const crypto = require('crypto');
const app = express();
const PORT = process.env.PORT || 10000;

// Credentials come ONLY from Render env vars. No defaults in code: refuse to start without them.
const OPS_USER = process.env.OPS_USER;
const OPS_PASS = process.env.OPS_PASS;
const N8N_URL = (process.env.N8N_URL || '').replace(/\/+$/, '');
const N8N_API_KEY = process.env.N8N_API_KEY;
if (!OPS_USER || !OPS_PASS || !N8N_URL || !N8N_API_KEY) {
  console.error('Set OPS_USER, OPS_PASS, N8N_URL and N8N_API_KEY in Render > Environment');
  process.exit(1);
}

// Constant-time compare so the password can't be guessed by timing responses.
const same = (a, b) => crypto.timingSafeEqual(
  crypto.createHash('sha256').update(String(a)).digest(),
  crypto.createHash('sha256').update(String(b)).digest());

function auth(req, res, next) {
  const b64 = (req.headers.authorization || '').split(' ')[1] || '';
  const decoded = Buffer.from(b64, 'base64').toString();
  const i = decoded.indexOf(':');                       // passwords may contain ':'
  const u = decoded.slice(0, i), p = decoded.slice(i + 1);
  if (i > 0 && same(u, OPS_USER) && same(p, OPS_PASS)) return next();
  res.set('WWW-Authenticate', 'Basic realm="OBBO Ops"').status(401).send('Login required');
}

async function n8n(path) {
  const r = await fetch(`${N8N_URL}${path}`, {
    headers: { 'X-N8N-API-KEY': N8N_API_KEY, accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`n8n ${path.split('?')[0]} returned HTTP ${r.status}`);
  return r.json();
}

app.get('/api/ops', auth, async (req, res) => {
  try {
    const [execData, wfData] = await Promise.all([
      n8n('/api/v1/executions?limit=50&includeData=false'),
      n8n('/api/v1/workflows?limit=250'),
    ]);
    const nameMap = Object.fromEntries((wfData.data || []).map(w => [String(w.id), w.name]));
    res.json((execData.data || []).map(e => ({
      id: e.id,
      name: nameMap[String(e.workflowId)] || `Workflow ${e.workflowId}`,
      status: e.status,
      startedAt: e.startedAt,
    })));
  } catch (err) {
    console.error(err);                                  // details stay in Render logs
    res.status(502).json({ error: 'Could not reach n8n. Check N8N_URL and N8N_API_KEY.' });
  }
});

// No credentials in the page: the browser re-sends Basic auth to /api/ops by itself.
app.get('/', auth, (req, res) => {
  res.set('Cache-Control', 'no-store').send(`<!doctype html>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>OBBO Ops</title><h1>OBBO Ops</h1><div id="list">Loading...</div>
<script>
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  fetch('/api/ops').then(r => r.json()).then(d => {
    const el = document.getElementById('list');
    if (d.error) { el.innerText = d.error; return; }
    el.innerHTML = d.length ? d.map(e =>
      '<p>' + esc(e.name) + ' - ' + esc(e.status) + ' - ' + esc(new Date(e.startedAt).toLocaleString()) + '</p>').join('')
      : 'No executions yet';
  }).catch(() => document.getElementById('list').innerText = 'Failed to load');
</script>`);
});

app.listen(PORT, () => console.log('OBBO Ops live on ' + PORT));

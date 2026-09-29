const http = require('http');
const crypto = require('crypto');

const PORT = process.env.PORT || 8888;
const DEFAULT_TARGET = process.env.TARGET || 'http://n8n:5678/webhook/ingest';

let caughtAlerts = [];

const GOOD_PAYLOAD = {
  event_id: 'evt-1001',
  customer_email: 'alice@example.com',
  amount: 129.99,
  company: 'Acme Corp',
  plan: 'pro',
};

function fireEvent(mode) {
  const p = { ...GOOD_PAYLOAD };

  if (mode === 'drift' || mode === 'unit_drift') {
    // Simulate upstream silently renaming fields
    p.client_mail = p.customer_email;
    p.org_name = p.company;
    delete p.customer_email;
    delete p.company;
  }
  if (mode === 'unit_drift') {
    // amount renamed to total_cents AND converted to integer cents.
    // A safe healer must REFUSE to map this 1:1 (unit conversion) -> expect DLQ.
    p.total_cents = Math.round(p.amount * 100);
    delete p.amount;
  }
  if (mode === 'dirty') {
    // Non-recoverable garbage: broken email, missing required amount
    p.customer_email = 'not-an-email';
    delete p.amount;
  }

  return p;
}

function post(target, payload, headers) {
  const body = JSON.stringify(payload);
  const { hostname, port, pathname, protocol } = new URL(target);
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname,
        port: port || (protocol === 'https:' ? 443 : 80),
        path: pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), ...headers },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode, body: data.slice(0, 200) }));
      }
    );
    req.on('error', (e) => resolve({ status: 0, body: e.message }));
    req.write(body);
    req.end();
  });
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);

  if (u.pathname === '/catch' && req.method === 'POST') {
    // Local alert catcher: point DRIFT_ALERT_WEBHOOK_URL / DLQ_ALERT_WEBHOOK_URL here
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      caughtAlerts.unshift({ at: new Date().toISOString(), body: body.slice(0, 1000) });
      caughtAlerts = caughtAlerts.slice(0, 10);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"status":"caught"}');
    });
    return;
  }
  if (u.pathname === '/catch' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(caughtAlerts, null, 2));
  }

  if (u.pathname !== '/fire') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      service: 'mock-chaos-server',
      usage: 'GET /fire?mode=normal|duplicate|drift|unit_drift|dirty&target=<url>&times=<n>&source=<source-id>  ·  GET /catch (last alerts)',
      default_target: DEFAULT_TARGET,
    }));
  }

  const mode = u.searchParams.get('mode') || 'normal';
  const target = u.searchParams.get('target') || DEFAULT_TARGET;
  const times = Math.min(parseInt(u.searchParams.get('times') || '1', 10), 20);
  const source = u.searchParams.get('source');
  const headers = source ? { 'x-source-id': source } : {};

  const results = [];
  for (let i = 0; i < times; i++) {
    const payload = fireEvent(mode);
    // Duplicates re-send the exact same event_id to exercise idempotency
    if (mode !== 'duplicate') payload.event_id = `evt-${crypto.randomUUID().slice(0, 8)}`;
    results.push(await post(target, payload, headers));
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ mode, target, times, source: source || 'default', results }, null, 2));
});

server.listen(PORT, () => console.log(`mock-chaos-server on :${PORT}, target=${DEFAULT_TARGET}`));

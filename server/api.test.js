/**
 * End-to-end API tests.
 *
 * Boots the real server in a child process against a throwaway database, so
 * nothing here touches development data. The submission rate limit is raised
 * for the main instance; a second short-lived instance with a low limit
 * covers the limiter itself.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ADMIN_TOKEN = 'test-token-do-not-use-in-production';
const SERVER = resolve(import.meta.dirname, 'server.js');

const validBody = {
  name: 'Jordan Ellis',
  email: 'jordan@example.com',
  phone: '03 9432 1044',
  sector: 'retail',
  message: 'We need a full fitout for a new cafe tenancy in Preston.',
};

/** Starts a server on `port` and resolves once /api/health answers. */
async function boot({ port, env = {} }) {
  const dir = mkdtempSync(join(tmpdir(), 'bfs-test-'));
  const child = spawn(process.execPath, [SERVER], {
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      ADMIN_TOKEN,
      DB_PATH: join(dir, 'test.db'),
      ...env,
    },
    stdio: 'ignore',
  });

  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 10_000;
  for (;;) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) break;
    } catch {
      /* not listening yet */
    }
    if (Date.now() > deadline) throw new Error(`server on ${port} did not start`);
    await new Promise((r) => setTimeout(r, 120));
  }

  return {
    base,
    stop() {
      child.kill('SIGTERM');
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

let main;
const BASE = () => main.base;

function post(body, path = '/api/enquiries', base = BASE()) {
  return fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function admin(path, init = {}) {
  return fetch(BASE() + path, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${ADMIN_TOKEN}` },
  });
}

before(async () => {
  // High limit so functional tests don't exhaust the budget.
  main = await boot({ port: 3987, env: { SUBMIT_RATE_MAX: '1000' } });
});

after(() => main?.stop());

test('health check responds', async () => {
  const res = await fetch(`${BASE()}/api/health`);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).status, 'ok');
});

test('serves the site at /', async () => {
  const res = await fetch(BASE() + '/');
  assert.equal(res.status, 200);
  assert.match(await res.text(), /BFS Projects/);
});

test('accepts a valid enquiry and returns a reference', async () => {
  const res = await post(validBody);
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.match(body.reference, /^BFS-\d{8}-[A-Z0-9]{6}$/);
});

test('rejects an invalid enquiry with per-field errors', async () => {
  const res = await post({ ...validBody, email: 'nope', message: 'x' });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error, 'validation_failed');
  assert.ok(body.fields.email);
  assert.ok(body.fields.message);
});

test('rejects malformed JSON', async () => {
  const res = await post('{ not json');
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'invalid_json');
});

test('rejects an oversized payload', async () => {
  const res = await post({ ...validBody, message: 'x'.repeat(40_000) });
  assert.equal(res.status, 413);
});

test('silently absorbs a honeypot submission', async () => {
  const res = await post({ ...validBody, company_website: 'http://spam.example' });
  assert.equal(res.status, 202);
  assert.equal((await res.json()).reference, null);
});

test('admin list rejects a missing token', async () => {
  const res = await fetch(`${BASE()}/api/enquiries`);
  assert.equal(res.status, 401);
});

test('admin list rejects a wrong token', async () => {
  const res = await fetch(`${BASE()}/api/enquiries`, {
    headers: { Authorization: 'Bearer wrong-token-entirely-but-same-len' },
  });
  assert.equal(res.status, 401);
});

test('admin list returns stored enquiries with a valid token', async () => {
  const res = await admin('/api/enquiries');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.total >= 1);
  assert.ok(Array.isArray(body.items));
});

test('honeypot submissions are never persisted', async () => {
  const res = await admin('/api/enquiries?limit=200');
  const { items } = await res.json();
  assert.ok(items.every((i) => i.email !== 'spam.example'));
});

test('admin can update an enquiry status', async () => {
  const created = await (await post({ ...validBody, email: 'status@example.com' })).json();

  const res = await admin(`/api/enquiries/${created.reference}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'contacted' }),
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).status, 'contacted');
});

test('admin rejects an unknown status value', async () => {
  const created = await (await post({ ...validBody, email: 'bad@example.com' })).json();
  const res = await admin(`/api/enquiries/${created.reference}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'wat' }),
  });
  assert.equal(res.status, 400);
});

test('unknown reference returns 404', async () => {
  const res = await admin('/api/enquiries/BFS-19700101-XXXXXX');
  assert.equal(res.status, 404);
});

test('unknown api route returns json 404', async () => {
  const res = await fetch(`${BASE()}/api/nope`);
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error, 'not_found');
});

test('SQL injection attempt is stored as literal text, not executed', async () => {
  const nasty = "Robert'); DROP TABLE enquiries;--";
  const created = await (
    await post({ ...validBody, name: nasty, email: 'bobby@example.com' })
  ).json();
  assert.equal(created.ok, true);

  // Table survives and the value round-trips verbatim.
  const res = await admin(`/api/enquiries/${created.reference}`);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).name, nasty);

  // Subsequent reads still work, proving the table wasn't dropped.
  assert.equal((await admin('/api/enquiries')).status, 200);
});

test('sets hardening headers and hides the framework', async () => {
  const res = await fetch(BASE() + '/');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(res.headers.get('content-security-policy'));
  assert.equal(res.headers.get('x-powered-by'), null);
});

test('rate limits repeated submissions', async () => {
  // Dedicated instance with a low ceiling so the limiter is the thing tested.
  const limited = await boot({ port: 3988, env: { SUBMIT_RATE_MAX: '3' } });
  try {
    const statuses = [];
    for (let i = 0; i < 5; i += 1) {
      const res = await post({ ...validBody, email: `burst${i}@example.com` }, '/api/enquiries', limited.base);
      statuses.push(res.status);
      if (res.status === 429) assert.ok(res.headers.get('retry-after'));
    }
    assert.deepEqual(statuses.slice(0, 3), [201, 201, 201]);
    assert.deepEqual(statuses.slice(3), [429, 429]);
  } finally {
    limited.stop();
  }
});

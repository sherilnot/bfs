# BFS Projects

Single-page marketing site with a Node.js enquiry backend.

## Requirements

Node 22.5 or newer — the backend uses the built-in `node:sqlite` module, so
there is no native database driver to compile.

## Setup

```bash
npm install
cp .env.example .env      # then fill in ADMIN_TOKEN
npm start                 # http://127.0.0.1:3000
```

For development with auto-restart:

```bash
npm run dev
```

## Layout

```
index.html            the single page
assets/css            styles, graphics, animations
assets/js             frontend behaviour (enquiry.js posts the form)
assets/frames         hero frame sequence
images                logo and photography
server/               backend
  server.js           Express app, routes, security headers
  db.js               SQLite schema and prepared statements
  validate.js         server-side input validation
  rateLimit.js        in-memory fixed-window limiter
data/                 SQLite file (created at runtime, gitignored)
```

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Listen port |
| `HOST` | `127.0.0.1` | Bind address. Use `0.0.0.0` to expose on the network |
| `ADMIN_TOKEN` | _unset_ | Enables the admin endpoints. Unset means they return 503 |
| `DB_PATH` | `./data/enquiries.db` | SQLite file location |
| `TRUST_PROXY` | _unset_ | Set when behind a reverse proxy so client IPs are real |
| `SUBMIT_RATE_MAX` | `5` | Submissions allowed per window per IP |
| `SUBMIT_RATE_WINDOW_MS` | `600000` | Rate limit window (10 minutes) |

Generate an admin token with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## API

### Public

`POST /api/enquiries` — submit an enquiry.

```json
{
  "name": "Jordan Ellis",
  "email": "jordan@example.com",
  "phone": "03 9432 1044",
  "sector": "hospitality",
  "message": "Full cafe fitout in Brunswick, roughly 90sqm."
}
```

`name`, `email` and `message` are required. `sector` must be one of `retail`,
`hospitality`, `cafe-restaurant`, `fast-food`, `commercial-office`,
`sporting-venue`, `other`.

- `201` — `{ ok, reference, message }`
- `400` — `{ error: "validation_failed", fields: { email: "…" } }`
- `429` — rate limited, with `Retry-After`

`GET /api/health` — liveness check.
`GET /api/sectors` — the accepted sector values.

### Admin

All require `Authorization: Bearer $ADMIN_TOKEN` and return `503` when
`ADMIN_TOKEN` is unset.

- `GET /api/enquiries?limit=50&offset=0` — paginated list
- `GET /api/enquiries/:reference` — single enquiry
- `PATCH /api/enquiries/:reference/status` — body `{ "status": "contacted" }`,
  one of `new`, `contacted`, `quoted`, `closed`

Example:

```bash
curl http://127.0.0.1:3000/api/enquiries \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

## Tests

```bash
npm test
```

31 tests: validation unit tests plus end-to-end API tests that boot the real
server against a temporary database. Covers validation, auth, rate limiting,
the honeypot, oversized and malformed payloads, and confirms parameterised
queries neutralise SQL injection attempts.

## Security notes

- **Admin endpoints fail closed.** Without `ADMIN_TOKEN` they are disabled
  rather than open, so a missed config step cannot expose contact details.
  Tokens are compared with `timingSafeEqual`.
- **All input is validated server-side.** The HTML validation attributes are a
  convenience, not a control.
- **Queries use bound parameters** throughout, never string interpolation.
- **Bodies are capped at 16 kB** and rate limited per IP.
- **Forwarded headers are only trusted** when `TRUST_PROXY` is set; otherwise a
  client could spoof its IP past the limiter.

## Deployment

The app is self-contained: one Node process serves the static site and the API,
and stores enquiries in a SQLite file. No external database or build step.

### Docker (recommended)

```bash
docker build -t bfs-projects .
docker run -d --name bfs \
  -p 3000:3000 \
  -e ADMIN_TOKEN="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")" \
  -e TRUST_PROXY=1 \
  -v bfs-data:/app/data \
  bfs-projects
```

The image runs as a non-root user, binds `0.0.0.0`, keeps the database on the
`/app/data` volume, and ships a `HEALTHCHECK` that polls `/api/health`.

### Docker Compose

```bash
export ADMIN_TOKEN="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
docker compose up -d --build
```

`docker-compose.yml` wires up a persistent named volume (`bfs-data`) and
requires `ADMIN_TOKEN` to be set. Enquiries survive restarts and rebuilds.

### Platform (Render, Railway, Fly.io, etc.)

- Build/start command: `npm ci --omit=dev` then `npm start`
- Set `HOST=0.0.0.0`, `ADMIN_TOKEN`, `TRUST_PROXY=1`
- Point `DB_PATH` at a mounted persistent disk (e.g. `/data/enquiries.db`).
  Ephemeral filesystems lose every enquiry on redeploy.
- Health check path: `/api/health`

See `.env.production.example` for the full set of variables.

### Behind a reverse proxy

Terminate TLS at nginx / Caddy / Cloudflare and forward to the app. Set
`TRUST_PROXY=1` so the rate limiter reads the real client IP from
`X-Forwarded-For` instead of the proxy's address.

### Before going to production

- **Serve over HTTPS.** Submissions carry personal contact details and are
  currently plaintext over HTTP. Terminate TLS at a proxy and set `TRUST_PROXY`.
- **The rate limiter is per process, in memory.** Running more than one
  instance multiplies the effective limit. Move the counters to Redis if you
  scale out.
- **Nothing emails you when an enquiry lands.** They only go to the database,
  so someone has to poll the admin endpoint. Wire up an email or Slack
  notification if that matters.
- **Back up `data/enquiries.db`.** It is the only copy of submitted enquiries.
- **Add a privacy notice** to the form if you are collecting personal data
  under the Australian Privacy Act.

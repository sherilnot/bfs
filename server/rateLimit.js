/**
 * Fixed-window rate limiter, in memory.
 *
 * Adequate for a single-instance marketing site. If this ever runs behind
 * more than one process or box, move the counters to Redis or similar -
 * per-process memory would let a client get N requests per instance.
 */

/**
 * @param {object} options
 * @param {number} options.windowMs  Window length in milliseconds.
 * @param {number} options.max       Allowed requests per window per key.
 */
export function rateLimit({ windowMs, max }) {
  /** @type {Map<string, { count: number, resetAt: number }>} */
  const hits = new Map();

  // Stop the map growing without bound. unref() so it never holds the
  // process open on shutdown.
  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(key);
    }
  }, windowMs).unref();

  function middleware(req, res, next) {
    const key = clientKey(req);
    const now = Date.now();
    let entry = hits.get(key);

    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }

    entry.count += 1;

    const remaining = Math.max(max - entry.count, 0);
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(remaining));
    res.setHeader('RateLimit-Reset', String(Math.ceil((entry.resetAt - now) / 1000)));

    if (entry.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).json({
        error: 'too_many_requests',
        message: 'Too many requests. Please wait a moment and try again.',
      });
    }

    return next();
  }

  middleware.stop = () => clearInterval(sweeper);
  return middleware;
}

/**
 * Identifies the caller for limiting purposes.
 *
 * req.ip already honours Express's trust proxy setting, so this is only a
 * fallback for the direct-connection case.
 */
function clientKey(req) {
  return req.ip ?? req.socket?.remoteAddress ?? 'unknown';
}

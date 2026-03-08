const stores = new Map();

function cleanup(now = Date.now()) {
  for (const [key, entry] of stores.entries()) {
    if (entry.resetAt <= now) stores.delete(key);
  }
}

function createRateLimit({ windowMs, max, keyPrefix = 'global', message }) {
  return (req, res, next) => {
    const now = Date.now();
    cleanup(now);
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown';
    const key = `${keyPrefix}:${ip}`;
    const current = stores.get(key);

    if (!current || current.resetAt <= now) {
      stores.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    current.count += 1;
    if (current.count > max) {
      const retryAfter = Math.ceil((current.resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: message || 'Muitas tentativas. Tente novamente em instantes.',
        retryAfter,
      });
    }

    return next();
  };
}

module.exports = { createRateLimit };

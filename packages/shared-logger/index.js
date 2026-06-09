'use strict';
const crypto = require('crypto');

// Minimal structured (JSON) logger. Swap for `pino` in production.
function createLogger(service) {
  const emit = (level, msg, extra) =>
    process.stdout.write(
      JSON.stringify({ ts: new Date().toISOString(), level, service, msg, ...extra }) + '\n'
    );
  return {
    info: (msg, extra) => emit('info', msg, extra),
    warn: (msg, extra) => emit('warn', msg, extra),
    error: (msg, extra) => emit('error', msg, extra),
  };
}

// Express middleware: assigns/propagates a correlation id and logs each request.
function requestLogger(logger) {
  return (req, res, next) => {
    const requestId = req.headers['x-request-id'] || crypto.randomUUID();
    req.requestId = requestId;
    res.setHeader('x-request-id', requestId);
    const start = Date.now();
    res.on('finish', () =>
      logger.info('request', {
        requestId,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        ms: Date.now() - start,
        userId: req.headers['x-user-id'],
      })
    );
    next();
  };
}

module.exports = { createLogger, requestLogger };

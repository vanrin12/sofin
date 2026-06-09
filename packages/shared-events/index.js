'use strict';
const crypto = require('crypto');
const { EventEmitter } = require('events');

// Event-bus abstraction. The scaffold ships an in-PROCESS bus so the system
// runs without RabbitMQ. The interface (publish / subscribe with a routing-key
// pattern) mirrors a topic exchange, so a RabbitMQ-backed implementation can be
// dropped in without touching producers/consumers. See docs/05-events.md.
//
// Topic patterns support a trailing wildcard: "deal.*" or "*".

class InProcessBus {
  constructor() {
    this._emitter = new EventEmitter();
    this._emitter.setMaxListeners(0);
  }

  // type: "<domain>.<event>" e.g. "enrollment.created"
  publish(type, data, { producer = 'unknown', correlationId } = {}) {
    const envelope = {
      eventId: crypto.randomUUID(),
      type,
      occurredAt: new Date().toISOString(),
      producer,
      correlationId: correlationId || crypto.randomUUID(),
      data,
    };
    this._emitter.emit('event', envelope);
    return envelope;
  }

  // pattern: exact "deal.won", prefix "deal.*", or "*" for everything
  subscribe(pattern, handler) {
    this._emitter.on('event', (env) => {
      if (matches(pattern, env.type)) Promise.resolve(handler(env)).catch(() => {});
    });
  }
}

function matches(pattern, type) {
  if (pattern === '*') return true;
  if (pattern.endsWith('.*')) return type.startsWith(pattern.slice(0, -1));
  return pattern === type;
}

// Singleton bus, scoped to ONE process. In `npm run dev` each service is its
// own process, so cross-service events do NOT cross the boundary here — that's
// what RabbitMQ provides in production (swap getBus() for an amqplib client
// with the same publish/subscribe surface). Within a single process (e.g. a
// service publishing and consuming its own events) it works as-is.
let bus;
function getBus() {
  if (!bus) bus = new InProcessBus();
  return bus;
}

module.exports = { getBus, InProcessBus };

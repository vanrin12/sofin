import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';

export interface EventEnvelope<T = any> {
  eventId: string;
  type: string;
  occurredAt: string;
  producer: string;
  correlationId: string;
  data: T;
}

// Injectable event bus. The scaffold ships an in-PROCESS implementation so the
// system runs without RabbitMQ. The publish/subscribe surface mirrors a topic
// exchange, so a RabbitMQ-backed EventBus can be dropped in without touching
// producers/consumers. NOTE: in `npm run dev` each service is its own process,
// so cross-service events do not cross the boundary here — that is what RabbitMQ
// provides in production. See docs/05-events.md.
@Injectable()
export class EventBus {
  private readonly emitter = new EventEmitter();
  constructor() {
    this.emitter.setMaxListeners(0);
  }

  publish<T>(type: string, data: T, opts: { producer?: string; correlationId?: string } = {}): EventEnvelope<T> {
    const env: EventEnvelope<T> = {
      eventId: randomUUID(),
      type,
      occurredAt: new Date().toISOString(),
      producer: opts.producer ?? 'unknown',
      correlationId: opts.correlationId ?? randomUUID(),
      data,
    };
    this.emitter.emit('event', env);
    return env;
  }

  // pattern: exact "deal.won", prefix "deal.*", or "*" for everything
  subscribe(pattern: string, handler: (env: EventEnvelope) => void | Promise<void>): void {
    this.emitter.on('event', (env: EventEnvelope) => {
      if (this.matches(pattern, env.type)) Promise.resolve(handler(env)).catch(() => undefined);
    });
  }

  private matches(pattern: string, type: string): boolean {
    if (pattern === '*') return true;
    if (pattern.endsWith('.*')) return type.startsWith(pattern.slice(0, -1));
    return pattern === type;
  }
}

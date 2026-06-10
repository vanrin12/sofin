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

export type EventHandler = (env: EventEnvelope) => void | Promise<void>;

// Abstract event bus. Producers call publish(); consumers call subscribe() with
// a routing-key pattern. Implementations: InProcessEventBus (dev, no infra) and
// RabbitEventBus (topic exchange). Call sites depend only on this surface, so
// switching transport is a provider swap — see CommonModule.forRoot().
export interface PublishOpts {
  producer?: string;
  correlationId?: string;
  // Stable id for the event. The outbox relay passes the outbox row id so a
  // redelivery carries the SAME eventId and idempotent consumers dedupe it.
  eventId?: string;
}

@Injectable()
export abstract class EventBus {
  abstract publish<T>(type: string, data: T, opts?: PublishOpts): void | Promise<void>;
  abstract subscribe(pattern: string, handler: EventHandler): void;

  protected buildEnvelope<T>(type: string, data: T, opts: PublishOpts = {}): EventEnvelope<T> {
    return {
      eventId: opts.eventId ?? randomUUID(),
      type,
      occurredAt: new Date().toISOString(),
      producer: opts.producer ?? 'unknown',
      correlationId: opts.correlationId ?? randomUUID(),
      data,
    };
  }

  // pattern matching shared by implementations:
  // "*" → all, "deal.*" → prefix, otherwise exact.
  protected matches(pattern: string, type: string): boolean {
    if (pattern === '*') return true;
    if (pattern.endsWith('.*')) return type.startsWith(pattern.slice(0, -1));
    return pattern === type;
  }
}

// ── In-process implementation (no broker; one process only) ──────────────────
@Injectable()
export class InProcessEventBus extends EventBus {
  private readonly emitter = new EventEmitter();
  constructor() {
    super();
    this.emitter.setMaxListeners(0);
  }

  publish<T>(type: string, data: T, opts: PublishOpts = {}): void {
    this.emitter.emit('event', this.buildEnvelope(type, data, opts));
  }

  subscribe(pattern: string, handler: EventHandler): void {
    this.emitter.on('event', (env: EventEnvelope) => {
      if (this.matches(pattern, env.type)) Promise.resolve(handler(env)).catch(() => undefined);
    });
  }
}

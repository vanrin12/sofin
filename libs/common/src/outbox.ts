import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { EventBus } from './event-bus';

// An event to be published. Written to the `outbox` table inside the SAME
// transaction as the business change, then published by OutboxRelay.
export interface OutboxEvent {
  type: string;
  payload: any;
  producer: string;
  correlationId?: string;
}

// Shape of an `outbox` row (matches the Prisma model in each producing service).
export interface OutboxRow {
  id: string;
  type: string;
  payload: any;
  producer: string;
  correlationId: string | null;
}

// Build the `data` for `tx.outbox.create({ data })`. Use inside a $transaction:
//   await tx.outbox.create({ data: outboxData({ type, payload, producer }) })
export function outboxData(e: OutboxEvent) {
  return { type: e.type, payload: e.payload, producer: e.producer, correlationId: e.correlationId ?? null };
}

// Minimal Prisma surface the relay needs — lets one relay work with any
// service's generated client.
export interface OutboxCapablePrisma {
  outbox: {
    findMany(args: any): Promise<OutboxRow[]>;
    update(args: any): Promise<unknown>;
  };
}

export const OUTBOX_PRISMA = Symbol('OUTBOX_PRISMA');
const POLL_MS = Number(process.env.OUTBOX_POLL_MS || 1000);
const BATCH = 50;

// Polls the outbox for unpublished rows and publishes them via the EventBus.
// Reuses the row id as the event id (stable across redeliveries → idempotent
// consumers dedupe). A publish failure leaves the row unpublished for the next
// tick (at-least-once). Provide per producing service alongside a
// { provide: OUTBOX_PRISMA, useExisting: PrismaService }.
@Injectable()
export class OutboxRelay implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('OutboxRelay');
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly bus: EventBus,
    @Inject(OUTBOX_PRISMA) private readonly prisma: OutboxCapablePrisma,
  ) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => this.flush().catch((e) => this.logger.error(e.message)), POLL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async flush(): Promise<void> {
    if (this.running) return; // no overlapping ticks
    this.running = true;
    try {
      const rows = await this.prisma.outbox.findMany({
        where: { publishedAt: null },
        orderBy: { createdAt: 'asc' },
        take: BATCH,
      });
      for (const row of rows) {
        await this.bus.publish(row.type, row.payload, {
          producer: row.producer,
          correlationId: row.correlationId ?? undefined,
          eventId: row.id,
        });
        await this.prisma.outbox.update({ where: { id: row.id }, data: { publishedAt: new Date() } });
      }
      if (rows.length) this.logger.log(`published ${rows.length} outbox event(s)`);
    } finally {
      this.running = false;
    }
  }
}

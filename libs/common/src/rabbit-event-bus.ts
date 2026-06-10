import { Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import * as amqp from 'amqplib';
import { EventBus, EventHandler, EventEnvelope, PublishOpts } from './event-bus';

// RabbitMQ-backed bus over a durable topic exchange. Each service (consumerGroup)
// gets its OWN durable queue per subscription, so every service receives a copy
// of an event (fan-out by binding), and competing instances of the same service
// share a queue (load-balanced). Messages are persistent and ack'd after the
// handler succeeds; a throwing handler nacks (requeue=false → dead-letterable).
export class RabbitEventBus extends EventBus implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('RabbitEventBus');
  private connection!: Awaited<ReturnType<typeof amqp.connect>>;
  private channel!: amqp.Channel;
  private ready!: Promise<void>;
  private resolveReady!: () => void;
  private readonly subs: { pattern: string; handler: EventHandler }[] = [];

  constructor(
    private readonly url: string,
    private readonly consumerGroup: string,
    private readonly exchange = process.env.RABBITMQ_EXCHANGE || 'sofin.events',
  ) {
    super();
    this.ready = new Promise((resolve) => (this.resolveReady = resolve));
  }

  // Connect after all modules' onModuleInit have registered their subscriptions.
  async onApplicationBootstrap(): Promise<void> {
    await this.connectWithRetry();
    await this.channel.assertExchange(this.exchange, 'topic', { durable: true });
    for (const sub of this.subs) await this.bind(sub);
    this.resolveReady();
    this.logger.log(`connected (${this.consumerGroup}) — ${this.subs.length} subscription(s)`);
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.channel?.close();
      await this.connection?.close();
    } catch {
      /* already closed */
    }
  }

  async publish<T>(type: string, data: T, opts: PublishOpts = {}): Promise<void> {
    const env = this.buildEnvelope(type, data, opts);
    await this.ready;
    this.channel.publish(this.exchange, type, Buffer.from(JSON.stringify(env)), {
      persistent: true,
      messageId: env.eventId,
      correlationId: env.correlationId,
      contentType: 'application/json',
    });
  }

  subscribe(pattern: string, handler: EventHandler): void {
    this.subs.push({ pattern, handler });
    if (this.channel) this.bind({ pattern, handler }).catch((e) => this.logger.error(e.message));
  }

  private async bind(sub: { pattern: string; handler: EventHandler }): Promise<void> {
    const routingKey = this.toAmqpKey(sub.pattern);
    const queue = `${this.consumerGroup}.${sub.pattern}`;
    const dlx = `${this.exchange}.dlx`;
    const dlq = `${queue}.dlq`;

    // Dead-letter topology: a failed message is nacked (no requeue) and routed
    // by the broker to the DLX, which fans it into this queue's own .dlq for
    // inspection/replay instead of being dropped.
    await this.channel.assertExchange(dlx, 'topic', { durable: true });
    await this.channel.assertQueue(queue, {
      durable: true,
      arguments: { 'x-dead-letter-exchange': dlx, 'x-dead-letter-routing-key': queue },
    });
    await this.channel.assertQueue(dlq, { durable: true });
    await this.channel.bindQueue(dlq, dlx, queue);
    await this.channel.bindQueue(queue, this.exchange, routingKey);

    await this.channel.consume(queue, async (msg) => {
      if (!msg) return;
      try {
        const env = JSON.parse(msg.content.toString()) as EventEnvelope;
        await sub.handler(env);
        this.channel.ack(msg);
      } catch (e) {
        this.logger.error(`handler failed for ${queue} → ${dlq}: ${(e as Error).message}`);
        this.channel.nack(msg, false, false); // requeue=false → dead-letter to .dlq
      }
    });
  }

  // our pattern → AMQP topic key: "*" → "#", "deal.*" stays, exact stays.
  private toAmqpKey(pattern: string): string {
    if (pattern === '*') return '#';
    return pattern;
  }

  private async connectWithRetry(retries = 30): Promise<void> {
    for (let i = 0; i < retries; i++) {
      try {
        this.connection = await amqp.connect(this.url);
        this.channel = await this.connection.createChannel();
        await this.channel.prefetch(20);
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    throw new Error(`RabbitEventBus: could not connect to ${this.url}`);
  }
}

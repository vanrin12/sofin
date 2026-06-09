import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { EventBus, EventEnvelope } from '@app/common';

export interface Notification {
  id: string;
  userId: string;
  channel: string;
  template: string;
  payload: unknown;
  status: string;
  createdAt: string;
}

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger('NotificationsService');
  private notifications: Notification[] = [];
  private seen = new Set<string>(); // eventId dedupe — consumers are at-least-once

  constructor(private readonly bus: EventBus) {}

  onModuleInit() {
    this.bus.subscribe('user.created', (env) =>
      this.once(env, () => this.deliver(env.data.userId, 'email', 'welcome', env.data)),
    );
    this.bus.subscribe('enrollment.created', (env) =>
      this.once(env, () => this.deliver(env.data.userId, 'email', 'welcome_course', env.data)),
    );
    this.bus.subscribe('deal.won', (env) =>
      this.once(env, () => this.deliver(env.data.contactId, 'in_app', 'deal_won', env.data)),
    );
  }

  private once(env: EventEnvelope, handler: () => void) {
    if (this.seen.has(env.eventId)) return; // idempotent
    this.seen.add(env.eventId);
    handler();
  }

  private deliver(userId: string, channel: string, template: string, payload: unknown): Notification {
    const n: Notification = {
      id: randomUUID(),
      userId,
      channel,
      template,
      payload,
      status: 'sent',
      createdAt: new Date().toISOString(),
    };
    this.notifications.push(n);
    // Production: integrate an email/SMS/push provider here.
    this.logger.log(`notification sent ${channel}/${template} -> ${userId}`);
    return n;
  }

  forUser(userId: string): Notification[] {
    return this.notifications.filter((n) => n.userId === userId);
  }
}

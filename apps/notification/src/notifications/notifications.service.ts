import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Notification } from '@sofin/prisma-notif';
import { EventBus, EventEnvelope } from '@app/common';
import { PrismaService } from '../prisma/prisma.service';

export type { Notification };

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger('NotificationsService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly bus: EventBus,
  ) {}

  onModuleInit() {
    this.bus.subscribe('user.created', (env) => this.deliver(env, env.data.userId, 'email', 'welcome'));
    this.bus.subscribe('enrollment.created', (env) => this.deliver(env, env.data.userId, 'email', 'welcome_course'));
    this.bus.subscribe('deal.won', (env) => this.deliver(env, env.data.contactId, 'in_app', 'deal_won'));
  }

  // Idempotent on env.eventId via the unique constraint — safe under
  // at-least-once delivery (a redelivered event is skipped, not duplicated).
  private async deliver(env: EventEnvelope, userId: string, channel: string, template: string): Promise<void> {
    try {
      await this.prisma.notification.create({
        data: { eventId: env.eventId, userId, channel, template, payload: env.data },
      });
      // Production: integrate an email/SMS/push provider here.
      this.logger.log(`notification sent ${channel}/${template} -> ${userId}`);
    } catch (e: any) {
      if (e?.code === 'P2002') return; // duplicate eventId → already processed
      throw e;
    }
  }

  forUser(userId: string): Promise<Notification[]> {
    return this.prisma.notification.findMany({ where: { userId } });
  }
}

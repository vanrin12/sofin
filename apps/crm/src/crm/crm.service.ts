import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import type { Activity, Contact, Deal } from '@sofin/prisma-crm';
import { AuthUser, EventBus } from '@app/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateContactDto, CreateDealDto, UpdateDealDto } from './dto';

export type { Activity, Contact, Deal };

@Injectable()
export class CrmService implements OnModuleInit {
  private readonly logger = new Logger('CrmService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly bus: EventBus,
  ) {}

  // ── Event consumers: react to other services ──────────────────────────────
  onModuleInit() {
    this.bus.subscribe('user.created', (env) => this.logger.log(`user.created ${env.data.userId}`));
    this.bus.subscribe('enrollment.created', async (env) => {
      await this.prisma.activity.create({
        data: { contactId: env.data.userId, type: 'system_event', payload: env.data },
      });
      this.logger.log(`logged enrollment activity for ${env.data.userId}`);
    });
  }

  listContacts(): Promise<Contact[]> {
    return this.prisma.contact.findMany();
  }

  createContact(dto: CreateContactDto, user: AuthUser): Promise<Contact> {
    return this.prisma.contact.create({ data: { ...dto, ownerId: user.id } });
  }

  activitiesFor(contactId: string): Promise<Activity[]> {
    return this.prisma.activity.findMany({ where: { contactId } });
  }

  createDeal(dto: CreateDealDto, user: AuthUser): Promise<Deal> {
    return this.prisma.deal.create({
      data: { contactId: dto.contactId, title: dto.title, amount: dto.amount, ownerId: user.id },
    });
  }

  async updateDeal(id: string, dto: UpdateDealDto): Promise<Deal> {
    const existing = await this.prisma.deal.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException({ code: 'NOT_FOUND', message: 'deal not found' });
    const from = existing.stage;
    const deal = await this.prisma.deal.update({ where: { id }, data: { stage: dto.stage ?? existing.stage } });
    await this.bus.publish('deal.stage_changed', { dealId: deal.id, contactId: deal.contactId, from, to: deal.stage }, { producer: 'crm' });
    if (deal.stage === 'won')
      await this.bus.publish('deal.won', { dealId: deal.id, contactId: deal.contactId, amount: deal.amount }, { producer: 'crm' });
    return deal;
  }
}

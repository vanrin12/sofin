import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AuthUser, EventBus } from '@app/common';
import { CreateContactDto, CreateDealDto, UpdateDealDto } from './dto';

export interface Contact {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  ownerId: string;
  createdAt: string;
}
export interface Deal {
  id: string;
  contactId: string;
  title: string;
  amount?: number;
  stage: string;
  ownerId: string;
  createdAt: string;
}
export interface Activity {
  id: string;
  contactId: string;
  type: string;
  payload: unknown;
  createdAt: string;
}

@Injectable()
export class CrmService implements OnModuleInit {
  private readonly logger = new Logger('CrmService');
  private contacts = new Map<string, Contact>();
  private deals = new Map<string, Deal>();
  private activities: Activity[] = [];

  constructor(private readonly bus: EventBus) {}

  // ── Event consumers: react to other services ──────────────────────────────
  onModuleInit() {
    this.bus.subscribe('user.created', (env) => this.logger.log(`user.created ${env.data.userId}`));
    this.bus.subscribe('enrollment.created', (env) => {
      this.activities.push({
        id: randomUUID(),
        contactId: env.data.userId,
        type: 'system_event',
        payload: env.data,
        createdAt: env.occurredAt,
      });
      this.logger.log(`logged enrollment activity for ${env.data.userId}`);
    });
  }

  listContacts(): Contact[] {
    return [...this.contacts.values()];
  }

  createContact(dto: CreateContactDto, user: AuthUser): Contact {
    const contact: Contact = { id: randomUUID(), ...dto, ownerId: user.id, createdAt: new Date().toISOString() };
    this.contacts.set(contact.id, contact);
    return contact;
  }

  activitiesFor(contactId: string): Activity[] {
    return this.activities.filter((a) => a.contactId === contactId);
  }

  createDeal(dto: CreateDealDto, user: AuthUser): Deal {
    const deal: Deal = {
      id: randomUUID(),
      contactId: dto.contactId,
      title: dto.title,
      amount: dto.amount,
      stage: 'lead',
      ownerId: user.id,
      createdAt: new Date().toISOString(),
    };
    this.deals.set(deal.id, deal);
    return deal;
  }

  updateDeal(id: string, dto: UpdateDealDto): Deal {
    const deal = this.deals.get(id);
    if (!deal) throw new NotFoundException({ code: 'NOT_FOUND', message: 'deal not found' });
    const from = deal.stage;
    if (dto.stage) deal.stage = dto.stage;
    this.bus.publish('deal.stage_changed', { dealId: deal.id, contactId: deal.contactId, from, to: deal.stage }, { producer: 'crm' });
    if (deal.stage === 'won')
      this.bus.publish('deal.won', { dealId: deal.id, contactId: deal.contactId, amount: deal.amount }, { producer: 'crm' });
    return deal;
  }
}

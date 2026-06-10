import { Module } from '@nestjs/common';
import { OUTBOX_PRISMA, OutboxRelay } from '@app/common';
import { PrismaService } from '../prisma/prisma.service';
import { CrmController } from './crm.controller';
import { CrmService } from './crm.service';

@Module({
  controllers: [CrmController],
  providers: [CrmService, OutboxRelay, { provide: OUTBOX_PRISMA, useExisting: PrismaService }],
})
export class CrmModule {}

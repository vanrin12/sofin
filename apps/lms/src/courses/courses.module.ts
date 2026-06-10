import { Module } from '@nestjs/common';
import { OUTBOX_PRISMA, OutboxRelay } from '@app/common';
import { PrismaService } from '../prisma/prisma.service';
import { CoursesController } from './courses.controller';
import { CoursesService } from './courses.service';

@Module({
  controllers: [CoursesController],
  providers: [CoursesService, OutboxRelay, { provide: OUTBOX_PRISMA, useExisting: PrismaService }],
})
export class CoursesModule {}

import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@sofin/prisma-lms';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }
}

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health.controller';

// The gateway's routing/auth is wired as Express middleware in main.ts (proxying
// happens before Nest's router). This module just exposes /health.
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [HealthController],
})
export class AppModule {}

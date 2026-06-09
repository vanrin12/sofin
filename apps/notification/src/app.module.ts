import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { CommonModule, IdentityGuard, PermissionsGuard } from '@app/common';
import { NotificationsModule } from './notifications/notifications.module';
import { HealthController } from './health.controller';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), CommonModule, NotificationsModule],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: IdentityGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}

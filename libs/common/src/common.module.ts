import { DynamicModule, Global, Module } from '@nestjs/common';
import { EventBus, InProcessEventBus } from './event-bus';
import { RabbitEventBus } from './rabbit-event-bus';
import { IdentityGuard } from './guards/identity.guard';
import { PermissionsGuard } from './guards/permissions.guard';

// @Global so every service can inject EventBus and the guards without re-importing.
// forRoot(service) selects the transport: RabbitMQ when RABBITMQ_URL is set
// (service name = consumer group / queue prefix), otherwise an in-process bus.
@Global()
@Module({})
export class CommonModule {
  static forRoot(service: string): DynamicModule {
    const eventBus = {
      provide: EventBus,
      useFactory: () =>
        process.env.RABBITMQ_URL
          ? new RabbitEventBus(process.env.RABBITMQ_URL, service)
          : new InProcessEventBus(),
    };
    return {
      module: CommonModule,
      providers: [eventBus, IdentityGuard, PermissionsGuard],
      exports: [EventBus, IdentityGuard, PermissionsGuard],
    };
  }
}

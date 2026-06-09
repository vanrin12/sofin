import { Global, Module } from '@nestjs/common';
import { EventBus } from './event-bus';
import { IdentityGuard } from './guards/identity.guard';
import { PermissionsGuard } from './guards/permissions.guard';

// Global so every service can inject EventBus and use the guards without
// re-importing. Guards are also provided for APP_GUARD wiring in each app.
@Global()
@Module({
  providers: [EventBus, IdentityGuard, PermissionsGuard],
  exports: [EventBus, IdentityGuard, PermissionsGuard],
})
export class CommonModule {}

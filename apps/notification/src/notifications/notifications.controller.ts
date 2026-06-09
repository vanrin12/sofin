import { Controller, Get } from '@nestjs/common';
import { AuthUser, CurrentUser, Permissions } from '@app/common';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Permissions('notification:read')
  @Get('me')
  mine(@CurrentUser() user: AuthUser) {
    return this.notifications.forUser(user.id);
  }
}

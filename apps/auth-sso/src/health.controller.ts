import { Controller, Get } from '@nestjs/common';
import { Public, Raw } from '@app/common';

@Controller()
export class HealthController {
  @Public()
  @Raw()
  @Get('health')
  health() {
    return { status: 'ok' };
  }

  @Public()
  @Raw()
  @Get('ready')
  ready() {
    return { status: 'ready' };
  }
}

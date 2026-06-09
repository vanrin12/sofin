import { bootstrapService } from '@app/common';
import { AppModule } from './app.module';

bootstrapService(AppModule, Number(process.env.NOTIF_PORT || 4004), 'notification');

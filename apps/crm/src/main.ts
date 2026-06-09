import { bootstrapService } from '@app/common';
import { AppModule } from './app.module';

bootstrapService(AppModule, Number(process.env.CRM_PORT || 4003), 'crm');

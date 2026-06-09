import { bootstrapService } from '@app/common';
import { AppModule } from './app.module';

bootstrapService(AppModule, Number(process.env.LMS_PORT || 4002), 'lms');

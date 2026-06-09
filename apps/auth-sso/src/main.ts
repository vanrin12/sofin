import { bootstrapService } from '@app/common';
import { AppModule } from './app.module';

bootstrapService(AppModule, Number(process.env.AUTH_PORT || 4001), 'auth-sso');

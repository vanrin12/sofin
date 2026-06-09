import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { HttpExceptionFilter } from './filters/http-exception.filter';
import { TransformInterceptor } from './interceptors/transform.interceptor';

// Shared bootstrap for the domain services (not the gateway): validation,
// standard response envelope, normalised errors.
export async function bootstrapService(module: any, port: number, name: string): Promise<void> {
  const app = await NestFactory.create(module, { logger: ['log', 'warn', 'error'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor(app.get(Reflector)));
  app.enableShutdownHooks(); // fire onModuleDestroy (close DB/broker connections)
  await app.listen(port);
  new Logger(name).log(`listening on ${port}`);
}

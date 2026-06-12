import { Logger, ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
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

  const docsEnabled = process.env.SWAGGER_ENABLED !== 'false';
  const docsPath = process.env.SWAGGER_PATH || 'docs';
  if (docsEnabled) setupSwagger(app, name, docsPath);

  await app.listen(port);
  const logger = new Logger(name);
  logger.log(`listening on ${port}`);
  if (docsEnabled) logger.log(`API docs at /${docsPath}`);
}

// Per-service OpenAPI/Swagger UI. Each service serves its own spec on its own
// port; in production it sits behind the gateway. The gateway verifies the JWT
// and injects `x-user-id` / `x-user-roles` — so to call a protected route from
// this page directly, set those headers via the **Authorize** dialog.
function setupSwagger(app: INestApplication, name: string, path: string): void {
  const config = new DocumentBuilder()
    .setTitle(`Sofin · ${name}`)
    .setDescription(
      `${name} service API.\n\n` +
        'Requests normally arrive through the gateway, which verifies the JWT and ' +
        'injects `x-user-id` / `x-user-roles`. To exercise a protected route from ' +
        'here, set those headers via **Authorize**. `bearer` documents the ' +
        'client → gateway contract.',
    )
    .setVersion('0.1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'bearer')
    .addApiKey({ type: 'apiKey', in: 'header', name: 'x-user-id' }, 'x-user-id')
    .addApiKey({ type: 'apiKey', in: 'header', name: 'x-user-roles' }, 'x-user-roles')
    // Apply auth globally so Swagger UI's "Authorize" actually attaches credentials.
    // Two alternatives (satisfy either): a gateway-issued JWT, OR — when calling a
    // service directly — both gateway-injected identity headers.
    .addSecurityRequirements('bearer')
    .addSecurityRequirements({ 'x-user-id': [], 'x-user-roles': [] })
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(path, app, document, {
    swaggerOptions: { persistAuthorization: true },
  });
}

import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';

// Normalises every error into { error: { code, message } } to match the API
// contract in docs/02-api-contracts.md.
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse();
    const req = host.switchToHttp().getRequest();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL';
    let message = 'internal error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse() as any;
      if (typeof body === 'string') {
        message = body;
        code = exception.name.replace(/Exception$/, '').toUpperCase();
      } else if (body && typeof body === 'object') {
        // ValidationPipe → { message: string|string[], error, statusCode }
        code = body.code || (status === 400 ? 'VALIDATION_ERROR' : String(body.error || 'ERROR').toUpperCase());
        message = Array.isArray(body.message) ? body.message[0] : body.message || message;
      }
    } else {
      this.logger.error((exception as Error)?.message, (exception as Error)?.stack);
    }

    res.status(status).json({ error: { code, message } });
  }
}

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { ENV, type Env } from './config/env';

export function configureApp(app: NestExpressApplication) {
  const env = app.get<Env>(ENV);
  app.setGlobalPrefix('v1');
  app.use(helmet());
  // Behind one reverse proxy / load balancer in production, so req.ip is the client.
  app.set('trust proxy', 1);
  app.useBodyParser('json', { limit: '100kb' });
  const origins = env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
  app.enableCors({ origin: origins.length ? origins : false, credentials: false });
  app.enableShutdownHooks();
  return env;
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  const env = configureApp(app);

  if (env.NODE_ENV !== 'production') {
    const doc = new DocumentBuilder()
      .setTitle('Wasla API')
      .setDescription('REST API for the Wasla carpooling platform. Errors are { error: { code, message } }.')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, doc));
  }

  await app.listen(env.PORT);
  app.get(Logger).log(`Wasla API listening on http://localhost:${env.PORT}/v1 (docs: /docs)`);
  if (env.OTP_PROVIDER === 'mock') app.get(Logger).warn('OTP provider is MOCK — codes are printed to this log. Development only.');
}

if (require.main === module) {
  void bootstrap();
}

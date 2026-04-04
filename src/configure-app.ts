import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import helmet from 'helmet';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { Logger } from 'nestjs-pino';

export function configureApp(app: INestApplication): void {
  app.useLogger(app.get(Logger));

  app.use(helmet());
  app.use(compression());

  app.enableCors({
    origin: process.env.CORS_ORIGINS?.split(',') ?? ['http://localhost:3000'],
    credentials: true,
  });

  app.setGlobalPrefix('api/v1', {
    exclude: ['/health', '/health/ready', '/webhooks/clerk'],
  });

  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Consistency App API')
    .setDescription(
      'Backend API for the Consistency habit-tracking application',
    )
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'clerk-jwt',
    )
    .addTag('health', 'Health checks')
    .addTag('auth', 'Clerk webhooks')
    .addTag('users', 'User profile and onboarding')
    .addTag('systems', 'Life systems management')
    .addTag('areas', 'System areas')
    .addTag('bundles', 'Action bundles (baseline/normal/stretch)')
    .addTag('checkins', 'Daily check-ins')
    .addTag('energy', 'Daily energy levels')
    .addTag('reflections', 'Daily reflections')
    .addTag('momentum', 'Analytics and stats (read-only)')
    .addTag('today', 'Today page aggregate (read-only)')
    .addTag('ai', 'AI Coach')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  cleanupOpenApiDoc(document);
  SwaggerModule.setup('api/docs', app, document);
}

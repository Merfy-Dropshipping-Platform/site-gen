import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const logger = new Logger('SitesBootstrap');
  const app = await NestFactory.create(AppModule);

  const config = app.get(ConfigService);
  const rabbitmqUrl = config.get<string>('RABBITMQ_URL');

  if (!rabbitmqUrl) {
    throw new Error('RABBITMQ_URL is not defined');
  }

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [rabbitmqUrl],
      queue: 'sites_queue',
      queueOptions: {
        durable: true,
      },
    },
  });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  await app.startAllMicroservices();

  const port = Number.parseInt(String(process.env.PORT ?? 3020), 10);
  await app.listen(port);
  logger.log(`Sites service HTTP listening on http://localhost:${port}`);
  logger.log('Sites microservice connected to RabbitMQ (sites_queue)');
}

bootstrap().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});


import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { MicroserviceOptions, Transport } from "@nestjs/microservices";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Logger } from "nestjs-pino";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  // Использовать Pino как основной logger
  app.useLogger(app.get(Logger));

  const logger = app.get(Logger);

  const config = app.get(ConfigService);
  const rabbitmqUrl = config.get<string>("RABBITMQ_URL");

  if (!rabbitmqUrl) {
    throw new Error("RABBITMQ_URL is not defined");
  }

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [rabbitmqUrl],
      queue: "sites_queue",
      prefetchCount: 3,
      queueOptions: {
        durable: true,
      },
    },
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.startAllMicroservices();

  const port = Number.parseInt(String(process.env.PORT ?? 3114), 10);
  await app.listen(port);
  logger.log(`Sites service HTTP listening on http://localhost:${port}`);
  logger.log("Sites microservice connected to RabbitMQ (sites_queue)");
}

bootstrap().catch((e) => {
  console.error(e);
  process.exit(1);
});

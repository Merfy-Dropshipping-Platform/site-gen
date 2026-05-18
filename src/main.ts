import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { MicroserviceOptions, Transport } from "@nestjs/microservices";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Logger } from "nestjs-pino";
import * as path from "node:path";
import { scanBlockRegistry, validateRegistry } from "../packages/theme-contract/registry";
import { RegistryStore } from "./registry/registry.store";

async function bootstrap() {
  // Registry init + validation BEFORE Nest app creation.
  // Broken registry → process.exit(1) → Coolify retry fails → откат на
  // предыдущий рабочий artifact. См. spec 092 (defense in depth).
  // __dirname в проде = /app/dist/src → ../../packages = /app/packages.
  // В dev (ts-node/tsx) = /Users/.../sites/src → ../../packages = /Users/.../sites/packages.
  // Wait — в dev __dirname = .../sites/src, ../packages = .../sites/packages (one ..).
  // Различие dev vs prod build → resolve через process.cwd() — sites service всегда
  // запускается из service root (Coolify WORKDIR=/app, dev = sites/).
  const packagesDir = path.resolve(process.cwd(), "packages");
  try {
    const registry = await scanBlockRegistry(packagesDir);
    const { errors, warnings } = await validateRegistry(registry, packagesDir);
    if (warnings.length > 0) {
      console.warn(
        `[registry] ${warnings.length} warning(s):`,
        warnings.map((w) => `${w.code}:${w.block ?? "?"}`).join(", "),
      );
    }
    if (errors.length > 0) {
      console.error(`[registry] FATAL ${errors.length} error(s):`);
      for (const e of errors) {
        console.error(`  - ${e.code} ${e.block ?? ""}: ${e.message}${e.file ? ` (${e.file})` : ""}`);
      }
      process.exit(1);
    }
    RegistryStore.set(registry);
    console.log(`[registry] ${registry.blocks.length} blocks loaded from ${registry.source}`);
  } catch (e) {
    console.error("[registry] scan/validate failed:", e);
    process.exit(1);
  }

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

import { Module } from "@nestjs/common";
import { BulkOperationsController } from "./bulk.controller";
import { BulkOperationsService } from "./bulk.service";
import { DatabaseModule } from "../../db/database.module";
import { RabbitMQModule } from "../../rabbitmq/rabbitmq.module";
import { SiteGeneratorService } from "../../generator/generator.service";
import { S3StorageService } from "../../storage/s3.service";
import { TraefikRouterService } from "../../deployments/traefik-router.service";

@Module({
  imports: [DatabaseModule, RabbitMQModule],
  controllers: [BulkOperationsController],
  providers: [
    BulkOperationsService,
    SiteGeneratorService,
    S3StorageService,
    TraefikRouterService,
  ],
  exports: [BulkOperationsService],
})
export class BulkModule {}

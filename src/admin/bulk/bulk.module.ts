import { Module } from "@nestjs/common";
import { BulkOperationsController } from "./bulk.controller";
import { BulkOperationsService } from "./bulk.service";
import { DatabaseModule } from "../../db/database.module";
import { RabbitMQModule } from "../../rabbitmq/rabbitmq.module";

@Module({
  imports: [DatabaseModule, RabbitMQModule],
  controllers: [BulkOperationsController],
  providers: [BulkOperationsService],
  exports: [BulkOperationsService],
})
export class BulkModule {}

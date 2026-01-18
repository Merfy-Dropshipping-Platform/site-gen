import { Module } from "@nestjs/common";
import { RabbitMQModule } from "../rabbitmq/rabbitmq.module";
import { DomainClient } from "./domain.client";

@Module({
  imports: [RabbitMQModule],
  providers: [DomainClient],
  exports: [DomainClient],
})
export class DomainModule {}

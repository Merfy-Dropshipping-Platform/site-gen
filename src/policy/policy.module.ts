/**
 * PolicyModule -- модуль политик и контактов магазина.
 *
 * Импортирует DatabaseModule для доступа к PG_CONNECTION.
 * Предоставляет PolicyService и ContactsService.
 */
import { Module } from "@nestjs/common";
import { DatabaseModule } from "../db/database.module";
import { PolicyService } from "./policy.service";
import { ContactsService } from "./contacts.service";
import { PolicyController } from "./policy.controller";

@Module({
  imports: [DatabaseModule],
  controllers: [PolicyController],
  providers: [PolicyService, ContactsService],
  exports: [PolicyService, ContactsService],
})
export class PolicyModule {}

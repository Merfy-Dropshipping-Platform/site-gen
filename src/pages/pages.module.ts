/**
 * PagesModule — CRUD над custom user pages в revision.data.pages.
 */
import { Module } from "@nestjs/common";
import { PagesService } from "./pages.service";
import { PagesController } from "./pages.controller";
import { PagesMicroserviceController } from "./pages.microservice.controller";
import { DatabaseModule } from "../db/database.module";

@Module({
  imports: [DatabaseModule],
  controllers: [PagesController, PagesMicroserviceController],
  providers: [PagesService],
  exports: [PagesService],
})
export class PagesModule {}

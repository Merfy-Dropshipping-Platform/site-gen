/**
 * PagesModule — CRUD над custom user pages в revision.data.pages.
 */
import { Module } from "@nestjs/common";
import { PagesService } from "./pages.service";
import { PagesController } from "./pages.controller";
import { PagesMicroserviceController } from "./pages.microservice.controller";
import { DatabaseModule } from "../db/database.module";
import { DocumentAdapter } from "../content/document.adapter";
import { StoreContentService } from "../content/store-content.service";

@Module({
  imports: [DatabaseModule],
  controllers: [PagesController, PagesMicroserviceController],
  // Порт StoreContent (этап 2): правки страниц пишут новую ревизию через него.
  providers: [PagesService, DocumentAdapter, StoreContentService],
  exports: [PagesService],
})
export class PagesModule {}

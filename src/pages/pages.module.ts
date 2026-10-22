/**
 * PagesModule — CRUD над custom user pages в revision.data.pages.
 */
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { StorefrontBuilderClient } from "../storefront-preview/storefront-builder.client";
import { PagesService } from "./pages.service";
import { PagesController } from "./pages.controller";
import { PagesMicroserviceController } from "./pages.microservice.controller";
import { DatabaseModule } from "../db/database.module";
import { DocumentAdapter } from "../content/document.adapter";
import { StoreContentService } from "../content/store-content.service";

@Module({
  // ConfigModule — адрес сборщика витрин для StorefrontBuilderClient (новая тема, часть 4 блока 1 «Секций и SDK»).
  imports: [DatabaseModule, ConfigModule],
  controllers: [PagesController, PagesMicroserviceController],
  // Порт StoreContent (этап 2): правки страниц пишут новую ревизию через него.
  providers: [
    PagesService,
    DocumentAdapter,
    StoreContentService,
    StorefrontBuilderClient,
  ],
  exports: [PagesService],
})
export class PagesModule {}

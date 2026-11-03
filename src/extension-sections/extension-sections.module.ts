import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DatabaseModule } from "../db/database.module";
import { DocumentAdapter } from "../content/document.adapter";
import { StoreContentService } from "../content/store-content.service";
import { StorefrontBuilderClient } from "../storefront-preview/storefront-builder.client";
import { ExtensionPlaces } from "./extension-places";
import { ExtensionPlacements } from "./extension-placements";
import { ExtensionSectionsController } from "./extension-sections.controller";
import {
  ExtensionSectionPreview,
  ExtensionSectionPreviewController,
} from "./extension-section-preview";

// Секции и глобальные скрипты расширений от сервиса extensions (блок 12
// «Секций и SDK», 12.6, 12.7): свой экземпляр StorefrontBuilderClient — в
// StorefrontPreviewModule он не экспортируется. StorefrontHandoff — из
// глобального модуля блока 6.
@Module({
  imports: [DatabaseModule, ConfigModule],
  controllers: [ExtensionSectionsController, ExtensionSectionPreviewController],
  // Место по умолчанию (часть 12д): ревизию пишет порт StoreContent.
  providers: [
    StorefrontBuilderClient,
    DocumentAdapter,
    StoreContentService,
    ExtensionPlaces,
    ExtensionPlacements,
    ExtensionSectionPreview,
  ],
})
export class ExtensionSectionsModule {}

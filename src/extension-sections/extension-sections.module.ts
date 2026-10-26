import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { StorefrontBuilderClient } from "../storefront-preview/storefront-builder.client";
import { ExtensionSectionsController } from "./extension-sections.controller";

// Секции и глобальные скрипты расширений от сервиса extensions (блок 12
// «Секций и SDK», 12.6, 12.7): свой экземпляр StorefrontBuilderClient — в
// StorefrontPreviewModule он не экспортируется. StorefrontHandoff — из
// глобального модуля блока 6.
@Module({
  imports: [ConfigModule],
  controllers: [ExtensionSectionsController],
  providers: [StorefrontBuilderClient],
})
export class ExtensionSectionsModule {}

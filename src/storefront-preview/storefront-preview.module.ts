import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { StorefrontBuilderClient } from "./storefront-builder.client";
import { StorefrontPreviewController } from "./storefront-preview.controller";
import {
  StandPreviewMiddleware,
  ThemePanelMiddleware,
} from "./storefront-preview.middleware";

// Превью и «Настройки темы» магазинов новой темы (design.md блока 8): развилка
// стоит перед нынешними PreviewController и ThemePuckConfigController, их код
// не меняется. StorefrontHandoff — из глобального модуля блока 6.
@Module({
  imports: [ConfigModule],
  controllers: [StorefrontPreviewController],
  providers: [StorefrontBuilderClient],
})
export class StorefrontPreviewModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(StandPreviewMiddleware)
      .forRoutes({ path: "api/sites/:id/preview", method: RequestMethod.GET });
    consumer.apply(ThemePanelMiddleware).forRoutes({
      path: "api/themes/:themeId/puck-config",
      method: RequestMethod.GET,
    });
  }
}

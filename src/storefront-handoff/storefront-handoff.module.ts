import { Global, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DatabaseModule } from "../db/database.module";
import { StorefrontHandoff } from "./storefront-handoff.service";

// Global — как ActivityLogModule: старые входы сборки и источники событий в
// разных модулях внедряют StorefrontHandoff без перестройки их imports.
@Global()
@Module({
  imports: [ConfigModule, DatabaseModule],
  providers: [StorefrontHandoff],
  exports: [StorefrontHandoff],
})
export class StorefrontHandoffModule {}

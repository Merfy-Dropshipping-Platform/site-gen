import { Module } from "@nestjs/common";
import { DatabaseModule } from "../db/database.module";
import { DesignController } from "./design.controller";
import { DesignStore } from "./design.store";

// «Дизайн по ссылке» (21.11): RPC design.* в sites_queue и чистка design_looks (Cron — из ScheduleModule.forRoot
// приложения).
@Module({
  imports: [DatabaseModule],
  controllers: [DesignController],
  providers: [DesignStore],
})
export class DesignModule {}

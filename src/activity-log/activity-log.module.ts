import { Global, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ActivityLogPublisher } from "./activity-log.publisher";

// Global so any service in site-gen can inject ActivityLogPublisher
// without rewiring its module imports. Best-effort fan-out of activity
// envelopes to the activity-log microservice (see CONTRACT.md).
@Global()
@Module({
  imports: [ConfigModule],
  providers: [ActivityLogPublisher],
  exports: [ActivityLogPublisher],
})
export class ActivityLogModule {}

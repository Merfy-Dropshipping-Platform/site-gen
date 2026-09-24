/**
 * Провайдеры этапа 3 «Магазин одной командой» (src/store/) — одним списком,
 * который подключает AppModule и проверяет `store-module-wiring.spec.ts`.
 */
import type { Provider } from "@nestjs/common";
import {
  DrizzleLifecycleRepository,
  LIFECYCLE_REPOSITORY,
} from "./lifecycle/lifecycle.repository";
import { StoreLifecycleSteps } from "./lifecycle/lifecycle.steps";
import {
  LIFECYCLE_STEP_RUNNER,
  StoreLifecycleReconciler,
} from "./lifecycle/store-lifecycle.reconciler";
import { StoreLifecycleScheduler } from "./lifecycle/store-lifecycle.scheduler";
import {
  ORGANIZATION_DIRECTORY,
  RmqOrganizationDirectory,
} from "../user/organization-directory.client";

export const STORE_PROVIDERS: Provider[] = [
  { provide: LIFECYCLE_REPOSITORY, useClass: DrizzleLifecycleRepository },
  { provide: LIFECYCLE_STEP_RUNNER, useClass: StoreLifecycleSteps },
  { provide: ORGANIZATION_DIRECTORY, useClass: RmqOrganizationDirectory },
  StoreLifecycleReconciler,
  StoreLifecycleScheduler,
];

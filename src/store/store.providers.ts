/**
 * Провайдеры этапа 3 «Магазин одной командой» (src/store/) — одним списком,
 * который подключает AppModule и проверяет `store-module-wiring.spec.ts`.
 */
import type { Provider, Type } from "@nestjs/common";
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
import { CreateStoreCommand } from "./commands/create-store.command";
import { DrizzleStoreRegistry, STORE_REGISTRY } from "./store-registry";
import { DbThemeCatalog, THEME_CATALOG } from "./theme-catalog";
import { StoreCommandsController } from "./store-commands.controller";
import { SetThemeCommand } from "./theme-switch/set-theme.command";

export const STORE_PROVIDERS: Provider[] = [
  { provide: LIFECYCLE_REPOSITORY, useClass: DrizzleLifecycleRepository },
  { provide: LIFECYCLE_STEP_RUNNER, useClass: StoreLifecycleSteps },
  { provide: ORGANIZATION_DIRECTORY, useClass: RmqOrganizationDirectory },
  { provide: STORE_REGISTRY, useClass: DrizzleStoreRegistry },
  { provide: THEME_CATALOG, useClass: DbThemeCatalog },
  StoreLifecycleReconciler,
  StoreLifecycleScheduler,
  CreateStoreCommand,
  SetThemeCommand,
];

export const STORE_CONTROLLERS: Type<unknown>[] = [StoreCommandsController];

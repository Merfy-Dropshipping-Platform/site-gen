/**
 * Провода Nest для этапа 3: всё, что AppModule подключает из src/store/
 * (`STORE_PROVIDERS`, `STORE_CONTROLLERS`), плюс переведённые на команду
 * входы (регистрация, cron «без магазина») собираются контейнером с
 * заглушками внешних зависимостей. Ловит ошибки DI (токен без провайдера,
 * забытый @Inject) до деплоя — поднимать сервис целиком ради этого не нужно.
 */
import { Test } from "@nestjs/testing";
import { STORE_CONTROLLERS, STORE_PROVIDERS } from "../store.providers";
import { StoreLifecycleReconciler } from "../lifecycle/store-lifecycle.reconciler";
import { StoreLifecycleScheduler } from "../lifecycle/store-lifecycle.scheduler";
import { CreateStoreCommand } from "../commands/create-store.command";
import { StoreCommandsController } from "../store-commands.controller";
import {
  SetThemeCommand,
  type ThemeSwitchSites,
} from "../theme-switch/set-theme.command";
import type { StoreProvisioning } from "../lifecycle/lifecycle.steps";
import {
  BILLING_RMQ_SERVICE,
  PG_CONNECTION,
  USER_RMQ_SERVICE,
} from "../../constants";
import { SitesDomainService } from "../../sites.service";
import { StoreContentService } from "../../content/store-content.service";
import { BillingClient } from "../../billing/billing.client";
import { SitesEventsService } from "../../events/events.service";
import { UserListenerController } from "../../user/user.listener";
import { SiteProvisioningScheduler } from "../../scheduler/site-provisioning.scheduler";
import { ThemesService } from "../../themes.service";
import { ThemesMicroserviceController } from "../../themes.microservice.controller";

const EXTERNAL = [
  { provide: PG_CONNECTION, useValue: {} },
  { provide: USER_RMQ_SERVICE, useValue: { send: jest.fn() } },
  { provide: BILLING_RMQ_SERVICE, useValue: { send: jest.fn() } },
  { provide: SitesDomainService, useValue: {} },
  { provide: StoreContentService, useValue: {} },
  { provide: BillingClient, useValue: { readEntitlements: jest.fn() } },
  { provide: SitesEventsService, useValue: { emit: jest.fn() } },
];

describe("провода Nest: STORE_PROVIDERS + входы на команде", () => {
  it("контейнер собирает доводчик, команды, RPC-вход, регистрацию, cron и каталог тем", async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [
        ...STORE_CONTROLLERS,
        UserListenerController,
        ThemesMicroserviceController,
      ],
      providers: [
        ...EXTERNAL,
        ...STORE_PROVIDERS,
        SiteProvisioningScheduler,
        ThemesService,
      ],
    }).compile();

    for (const token of [
      StoreLifecycleReconciler,
      StoreLifecycleScheduler,
      CreateStoreCommand,
      SetThemeCommand,
      StoreCommandsController,
      UserListenerController,
      SiteProvisioningScheduler,
      ThemesService,
      ThemesMicroserviceController,
    ]) {
      expect(moduleRef.get(token)).toBeInstanceOf(token);
    }
  });
});

/**
 * Команды и шаги получают `SitesDomainService` через узкие интерфейсы.
 * Проверка компилятором: сервис им соответствует (иначе этот файл не
 * соберётся ts-jest и набор упадёт).
 */
export const sitesSatisfiesThemeSwitch = (
  s: SitesDomainService,
): ThemeSwitchSites => s;
export const sitesSatisfiesProvisioning = (
  s: SitesDomainService,
): StoreProvisioning => s;

/**
 * Провода Nest для этапа 3: всё, что AppModule подключает из src/store/
 * (`STORE_PROVIDERS`), собирается контейнером с заглушками внешних
 * зависимостей. Ловит ошибки DI (токен без провайдера, забытый @Inject) до
 * деплоя — поднимать сервис целиком ради этого не нужно.
 */
import { Test } from "@nestjs/testing";
import { STORE_PROVIDERS } from "../store.providers";
import { StoreLifecycleReconciler } from "../lifecycle/store-lifecycle.reconciler";
import { StoreLifecycleScheduler } from "../lifecycle/store-lifecycle.scheduler";
import { PG_CONNECTION, USER_RMQ_SERVICE } from "../../constants";
import { SitesDomainService } from "../../sites.service";
import { StoreContentService } from "../../content/store-content.service";

const EXTERNAL = [
  { provide: PG_CONNECTION, useValue: {} },
  { provide: USER_RMQ_SERVICE, useValue: { send: jest.fn() } },
  { provide: SitesDomainService, useValue: {} },
  { provide: StoreContentService, useValue: {} },
];

describe("провода Nest: STORE_PROVIDERS", () => {
  it("контейнер собирает доводчик и его тик", async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [...EXTERNAL, ...STORE_PROVIDERS],
    }).compile();

    expect(moduleRef.get(StoreLifecycleReconciler)).toBeInstanceOf(
      StoreLifecycleReconciler,
    );
    expect(moduleRef.get(StoreLifecycleScheduler)).toBeInstanceOf(
      StoreLifecycleScheduler,
    );
  });
});

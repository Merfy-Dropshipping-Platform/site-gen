/**
 * Публикация магазина новой темы отвечает номером сборки сборщика витрин
 * (design.md блока 6, раздел 4: «номер сборки сквозной: выдаётся при
 * постановке задания»), а не «queued», — и с очередью сборок
 * (BUILD_QUEUE_CONSUMER_ENABLED=true), и без неё. Событие уходит после записи
 * статуса и адреса: сборщик читает уже опубликованный магазин. Сборщик не
 * ответил — «queued»: событие уже в его очереди. Нынешние темы — как раньше.
 */
import { SitesDomainService } from "../../sites.service";

const SITE = "11111111-1111-4111-8111-111111111111";
const TENANT = "tenant-1";
const BUILD = 1791590400123;

function makeService(newTheme: boolean, build: number | null) {
  const order: string[] = [];
  const where = jest.fn(async () => void order.push("db"));
  const db = { update: () => ({ set: () => ({ where }) }) };
  const generator = {
    build: jest.fn(async () => ({
      buildId: "old-build",
      revisionId: "rev-1",
      artifactUrl: "s3://old",
    })),
  };
  const deployments = { deploy: jest.fn(async () => undefined) };
  const buildQueue = { queueBuild: jest.fn(async () => true) };
  const billing = {
    getEntitlements: jest.fn(async () => ({ planName: "pro" })),
  };
  const activity = { emit: jest.fn() };
  const handoff = {
    isNewTheme: jest.fn(async () => newTheme),
    requestBuild: jest.fn(async () => {
      order.push("request");
      return build;
    }),
  };
  const dep = {} as any;
  const service = new SitesDomainService(
    db as any,
    dep,
    generator as any,
    { emit: jest.fn() } as any,
    deployments as any,
    { extractSubdomainSlug: () => "shop" } as any,
    dep,
    billing as any,
    buildQueue as any,
    activity as any,
    undefined,
    handoff as any,
  );
  jest.spyOn(service, "get").mockImplementation(
    async () =>
      ({
        id: SITE,
        tenantId: TENANT,
        publicUrl: "https://shop.merfy.ru",
        storageSlug: "shop",
        coolifyAppUuid: "app-1",
      }) as never,
  );
  return {
    service,
    generator,
    deployments,
    buildQueue,
    handoff,
    activity,
    order,
  };
}

const publish = (service: SitesDomainService) =>
  service.publish({ tenantId: TENANT, siteId: SITE, mode: "production" });

describe.each(["true", "false"])(
  "publish() с BUILD_QUEUE_CONSUMER_ENABLED=%s",
  (queue) => {
    const saved = process.env.BUILD_QUEUE_CONSUMER_ENABLED;
    beforeAll(() => {
      process.env.BUILD_QUEUE_CONSUMER_ENABLED = queue;
    });
    afterAll(() => {
      process.env.BUILD_QUEUE_CONSUMER_ENABLED = saved;
    });

    it("новая тема: событие после записи статуса, в ответе и журнале — номер сборки", async () => {
      const {
        service,
        generator,
        deployments,
        buildQueue,
        handoff,
        activity,
        order,
      } = makeService(true, BUILD);
      const res = await publish(service);
      expect(res).toMatchObject({ buildId: String(BUILD) });
      expect(buildQueue.queueBuild).not.toHaveBeenCalled();
      expect(generator.build).not.toHaveBeenCalled();
      expect(deployments.deploy).not.toHaveBeenCalled();
      expect(handoff.requestBuild).toHaveBeenCalledWith(
        SITE,
        "SitesDomainService.publish",
      );
      expect(order).toEqual(["db", "request"]);
      expect(activity.emit.mock.calls[0][0].payload.meta.buildId).toBe(
        String(BUILD),
      );
    });

    it("сборщик не ответил за 3 с — «queued»: событие уже в его очереди", async () => {
      const { service } = makeService(true, null);
      expect(await publish(service)).toMatchObject({ buildId: "queued" });
    });
  },
);

describe("publish() магазина нынешней темы — как раньше, сборщика не спрашиваем", () => {
  const saved = process.env.BUILD_QUEUE_CONSUMER_ENABLED;
  afterAll(() => {
    process.env.BUILD_QUEUE_CONSUMER_ENABLED = saved;
  });

  it("с очередью — sites_build_queue и «queued»", async () => {
    process.env.BUILD_QUEUE_CONSUMER_ENABLED = "true";
    const { service, buildQueue, handoff } = makeService(false, null);
    expect(await publish(service)).toMatchObject({ buildId: "queued" });
    expect(buildQueue.queueBuild).toHaveBeenCalledWith(
      expect.objectContaining({ siteId: SITE, trigger: "publish" }),
    );
    expect(handoff.requestBuild).not.toHaveBeenCalled();
  });

  it("без очереди — старая сборка, перевыкладка и её номер", async () => {
    process.env.BUILD_QUEUE_CONSUMER_ENABLED = "false";
    const { service, generator, deployments, handoff } = makeService(
      false,
      null,
    );
    expect(await publish(service)).toEqual({
      url: "https://shop.merfy.ru",
      buildId: "old-build",
      artifactUrl: "s3://old",
    });
    expect(generator.build).toHaveBeenCalled();
    expect(deployments.deploy).toHaveBeenCalledWith(
      expect.objectContaining({ buildId: "old-build" }),
    );
    expect(handoff.requestBuild).not.toHaveBeenCalled();
  });
});

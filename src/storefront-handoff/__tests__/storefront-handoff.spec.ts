/**
 * StorefrontHandoff и проверка «магазин новой темы?» на входах старой сборки
 * (design.md блока 6, раздел 4, «Старые пути»; «Как проверить», п. 7).
 *
 * - магазин новой темы (nova) — событие сборщику в content.events, старая
 *   сборка не идёт; в логе «отдано сборщику»;
 * - нынешний магазин (rose) — старый путь, как до блока 6: сообщение в
 *   sites_build_queue, сборка конвейером;
 * - сбой базы при проверке — старый путь.
 */
import { Logger } from "@nestjs/common";
import { BuildQueuePublisher } from "../../rabbitmq/build-queue.service";
import { BuildQueueConsumer } from "../../rabbitmq/build-queue.consumer";
import { SITES_BUILD_QUEUE } from "../../rabbitmq/retry-setup.service";
import {
  HANDED_OFF_BUILD,
  SiteGeneratorService,
} from "../../generator/generator.service";
import {
  CONTENT_EXCHANGE,
  StorefrontHandoff,
  readNewThemeIds,
} from "../storefront-handoff.service";

const mockPublish = jest.fn().mockResolvedValue(true);
const mockSendToQueue = jest.fn().mockResolvedValue(true);
const mockAssertExchange = jest.fn().mockResolvedValue(undefined);
const mockAssertQueue = jest.fn().mockResolvedValue(undefined);

jest.mock("amqp-connection-manager", () => ({
  connect: () => ({
    createChannel: (opts: { setup?: (ch: unknown) => unknown }) => {
      void opts.setup?.({
        assertExchange: mockAssertExchange,
        assertQueue: mockAssertQueue,
      });
      return {
        publish: mockPublish,
        sendToQueue: mockSendToQueue,
        close: jest.fn().mockResolvedValue(undefined),
      };
    },
    close: jest.fn().mockResolvedValue(undefined),
  }),
}));

const NOVA_SITE = "11111111-1111-4111-8111-111111111111";
const ROSE_SITE = "22222222-2222-4222-8222-222222222222";

// База: select().from(site).where(...) → строка магазина с theme_id; Error — сбой
// базы; null — магазина нет.
function fakeDb(theme: string | null | Error): any {
  const rows = theme === null ? [] : [{ themeId: theme }];
  const where = () =>
    theme instanceof Error ? Promise.reject(theme) : Promise.resolve(rows);
  return { select: () => ({ from: () => ({ where }) }) };
}

const config = (values: Record<string, string>) =>
  ({ get: (key: string) => values[key] }) as any;

function handoff(theme: string | null | Error): StorefrontHandoff {
  const service = new StorefrontHandoff(
    config({ RABBITMQ_URL: "amqp://test" }),
    fakeDb(theme),
  );
  service.onModuleInit();
  return service;
}

const published = () =>
  mockPublish.mock.calls.map(([exchange, key, body]) => ({
    exchange,
    key,
    body: JSON.parse(body.toString()),
  }));

describe("StorefrontHandoff", () => {
  let logs: string[];

  beforeEach(() => {
    jest.clearAllMocks();
    logs = [];
    jest
      .spyOn(Logger.prototype, "log")
      .mockImplementation((m: unknown) => void logs.push(String(m)));
    jest
      .spyOn(Logger.prototype, "warn")
      .mockImplementation((m: unknown) => void logs.push(String(m)));
  });

  it("новые темы — ключи theme-versions.json блока 4", () => {
    const ids = readNewThemeIds(process.cwd());
    expect(ids.has("nova")).toBe(true);
    expect(ids.has("rose")).toBe(false);
  });

  it("точка обмена content.events объявляется topic, как у сборщика", () => {
    handoff("nova");
    expect(mockAssertExchange).toHaveBeenCalledWith(CONTENT_EXCHANGE, "topic", {
      durable: true,
    });
  });

  it("магазин новой темы: событие сборщику по trigger и «отдано сборщику» в логе", async () => {
    const service = handoff("nova");
    expect(await service.handOff(NOVA_SITE, "publish")).toBe(true);
    expect(await service.handOff(NOVA_SITE, "auto_repair")).toBe(true);
    const [publish, repair] = published();
    expect(publish).toMatchObject({
      exchange: CONTENT_EXCHANGE,
      key: "merchant-publish",
      body: {
        v: 1,
        type: "merchant-publish",
        siteId: NOVA_SITE,
        source: "old-path:publish",
      },
    });
    expect(Number.isNaN(Date.parse(publish.body.eventAt))).toBe(false);
    expect(repair.key).toBe("old-path");
    expect(
      logs.some((l) => l.startsWith(`отдано сборщику: site=${NOVA_SITE}`)),
    ).toBe(true);
  });

  it("нынешний магазин и неизвестный — старый путь, событий нет", async () => {
    expect(await handoff("rose").handOff(ROSE_SITE, "publish")).toBe(false);
    expect(await handoff(null).handOff(ROSE_SITE, "publish")).toBe(false);
    await handoff("rose").notify(ROSE_SITE, "shop-name-change", "test");
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it("notify магазина новой темы — событие с источником", async () => {
    await handoff("nova").notify(
      NOVA_SITE,
      "contacts-change",
      "ContactsService.upsert",
    );
    expect(published()).toMatchObject([
      {
        key: "contacts-change",
        body: { type: "contacts-change", source: "ContactsService.upsert" },
      },
    ]);
  });

  it("сбой базы — старый путь; сбой брокера — в лог, без исключения", async () => {
    expect(
      await handoff(new Error("db down")).handOff(NOVA_SITE, "publish"),
    ).toBe(false);
    mockPublish.mockRejectedValueOnce(new Error("broker down"));
    await expect(
      handoff("nova").notify(NOVA_SITE, "policy-change", "test"),
    ).resolves.toBeUndefined();
    expect(
      logs.some(
        (l) => l.includes("publish policy-change") && l.includes("broker down"),
      ),
    ).toBe(true);
  });

  it("без RABBITMQ_URL — событие не отправить, но и не упасть", async () => {
    const service = new StorefrontHandoff(config({}), fakeDb("nova"));
    service.onModuleInit();
    expect(await service.handOff(NOVA_SITE, "publish")).toBe(true);
    expect(logs.some((l) => l.startsWith("broker not ready"))).toBe(true);
  });
});

describe("входы старой сборки", () => {
  const gate = (newTheme: boolean) =>
    ({ handOff: jest.fn().mockResolvedValue(newTheme) }) as any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
  });

  it("постановка в sites_build_queue: новая тема — не встаёт, нынешняя — встаёт как раньше", async () => {
    const publisher = (newTheme: boolean) => {
      const p = new BuildQueuePublisher(
        config({ RABBITMQ_URL: "amqp://test" }),
        gate(newTheme),
      );
      void p.onModuleInit();
      return p;
    };
    const params = {
      tenantId: "t",
      siteId: NOVA_SITE,
      trigger: "product_update",
      priority: 5,
    };
    expect(await publisher(true).queueBuild(params)).toBe(true);
    expect(mockSendToQueue).not.toHaveBeenCalled();
    expect(
      await publisher(false).queueBuild({ ...params, siteId: ROSE_SITE }),
    ).toBe(true);
    expect(mockSendToQueue).toHaveBeenCalledWith(
      SITES_BUILD_QUEUE,
      expect.any(Buffer),
      {
        persistent: true,
        priority: 5,
      },
    );
  });

  it("задание из sites_build_queue: новая тема — подтверждено без конвейера", async () => {
    const handoffGate = gate(true);
    const consumer = new BuildQueueConsumer(
      config({}),
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      handoffGate,
    );
    const job = { tenantId: "t", siteId: NOVA_SITE, retryCount: 0 };
    const msg = { properties: { priority: 1 } };
    const settle = await (consumer as any).runJob(job, msg);
    const channel = { ack: jest.fn() };
    settle(channel, msg);
    expect(handoffGate.handOff).toHaveBeenCalledWith(
      NOVA_SITE,
      "sites_build_queue",
    );
    expect(channel.ack).toHaveBeenCalledWith(msg);
  });

  it("generator.build: новая тема — ответ «сборщик», база старого конвейера не тронута", async () => {
    const db = { select: jest.fn(), insert: jest.fn(), update: jest.fn() };
    const generator = new SiteGeneratorService(
      db as any,
      {} as any,
      {} as any,
      {} as any,
      undefined,
      gate(true),
    );
    expect(await generator.build({ tenantId: "t", siteId: NOVA_SITE })).toEqual(
      HANDED_OFF_BUILD,
    );
    expect(db.select).not.toHaveBeenCalled();
  });
});

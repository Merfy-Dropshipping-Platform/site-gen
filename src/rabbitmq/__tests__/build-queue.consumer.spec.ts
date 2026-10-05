/**
 * Tests for BuildQueueConsumer (build-queue.consumer.ts)
 *
 * Validates:
 * - Lifecycle: disabled flag / missing RABBITMQ_URL, start without a broker, destroy
 * - Channel setup (prefetch, queue assertion, consume) re-run on every reconnect
 * - Ack goes to the channel the message arrived on
 * - Discard branches, success, retry via DLX, dead letter
 * - A closed channel at settle time is logged, not thrown
 */
import { Logger } from "@nestjs/common";
import type { ConsumeMessage } from "amqplib";
import { BuildQueueConsumer } from "../build-queue.consumer";
import {
  DEAD_LETTER_QUEUE,
  DLX_EXCHANGE,
  MAX_RETRIES,
  RETRY_TIERS,
  SITES_BUILD_QUEUE,
} from "../retry-setup.service";
import { runBuildPipeline } from "../../generator/build.service";
import * as schema from "../../db/schema";

jest.mock("../../generator/build.service", () => ({
  runBuildPipeline: jest.fn(),
}));

jest.mock("../../storage/s3.service", () => ({
  S3StorageService: class S3StorageService {},
}));

// Mock amqp-connection-manager
const mockWrapperClose = jest.fn().mockResolvedValue(undefined);
const mockWaitForConnect = jest.fn().mockResolvedValue(undefined);
const mockWrapperOn = jest.fn();
const mockConnectionClose = jest.fn().mockResolvedValue(undefined);
const mockConnectionOn = jest.fn();

let channelSetup: ((channel: any) => Promise<void>) | null = null;

const mockCreateChannel = jest.fn().mockImplementation((opts: any) => {
  channelSetup = opts?.setup ?? null;
  return {
    close: mockWrapperClose,
    waitForConnect: mockWaitForConnect,
    on: mockWrapperOn,
  };
});

const mockConnect = jest.fn().mockImplementation(() => ({
  createChannel: mockCreateChannel,
  close: mockConnectionClose,
  on: mockConnectionOn,
}));

jest.mock("amqp-connection-manager", () => ({
  connect: (...args: any[]) => mockConnect(...args),
}));

const mockRunBuildPipeline = runBuildPipeline as jest.MockedFunction<
  typeof runBuildPipeline
>;

const ENABLED_CONFIG = {
  BUILD_QUEUE_CONSUMER_ENABLED: "true",
  RABBITMQ_URL: "amqp://localhost",
};

function mockConfigService(values: Record<string, string | undefined>) {
  return { get: jest.fn((key: string) => values[key]) } as any;
}

function mockDb() {
  const where = jest.fn().mockResolvedValue(undefined);
  const set = jest.fn(() => ({ where }));
  const update = jest.fn(() => ({ set }));
  return { db: { update } as any, update, set, where };
}

function fakeChannel() {
  return {
    prefetch: jest.fn().mockResolvedValue(undefined),
    assertQueue: jest.fn().mockResolvedValue({ queue: SITES_BUILD_QUEUE }),
    consume: jest.fn().mockResolvedValue({ consumerTag: "ctag" }),
    ack: jest.fn(),
    publish: jest.fn().mockReturnValue(true),
  };
}

type FakeChannel = ReturnType<typeof fakeChannel>;

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

/**
 * Delivers a message the way amqplib does: the consume callback's return value
 * is ignored, so the test waits for the handler's async work to drain.
 */
function onMessageOf(
  channel: FakeChannel,
): (msg: ConsumeMessage | null) => Promise<void> {
  const onMessage = channel.consume.mock.calls[0][1];
  return async (msg) => {
    onMessage(msg);
    await flushPromises();
  };
}

function message(
  body: unknown,
  properties: { headers?: Record<string, unknown>; priority?: number } = {},
): ConsumeMessage {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  return {
    content: Buffer.from(raw),
    fields: { deliveryTag: 1 } as any,
    properties: properties as any,
  };
}

function buildMessage(
  data: Record<string, unknown>,
  properties: { headers?: Record<string, unknown>; priority?: number } = {},
): ConsumeMessage {
  return message({ pattern: "sites.build_queued", data }, properties);
}

const productClient = { name: "product" } as any;
const billingClient = { name: "billing" } as any;
const s3 = { name: "s3" } as any;

function createConsumer(
  values: Record<string, string | undefined> = ENABLED_CONFIG,
  db = mockDb().db,
) {
  return new BuildQueueConsumer(
    mockConfigService(values),
    db,
    productClient,
    billingClient,
    s3,
  );
}

async function startedChannel(consumer: BuildQueueConsumer) {
  await consumer.onModuleInit();
  const channel = fakeChannel();
  await channelSetup!(channel);
  return channel;
}

describe("BuildQueueConsumer", () => {
  let warnSpy: jest.SpyInstance;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    channelSetup = null;
    mockRunBuildPipeline.mockResolvedValue(undefined as any);
    warnSpy = jest.spyOn(Logger.prototype, "warn").mockImplementation();
    logSpy = jest.spyOn(Logger.prototype, "log").mockImplementation();
    jest.spyOn(Logger.prototype, "error").mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("onModuleInit", () => {
    it("does not connect when BUILD_QUEUE_CONSUMER_ENABLED is not true", async () => {
      await createConsumer({ RABBITMQ_URL: "amqp://localhost" }).onModuleInit();

      expect(mockConnect).not.toHaveBeenCalled();
    });

    it("does not connect when RABBITMQ_URL is empty", async () => {
      await createConsumer({
        BUILD_QUEUE_CONSUMER_ENABLED: "TRUE",
        RABBITMQ_URL: "",
      }).onModuleInit();

      expect(mockConnect).not.toHaveBeenCalled();
    });

    it("connects through the connection manager with the configured url", async () => {
      await createConsumer().onModuleInit();

      expect(mockConnect).toHaveBeenCalledWith(["amqp://localhost"], {
        heartbeatIntervalInSeconds: 60,
        reconnectTimeInSeconds: 5,
      });
      expect(mockCreateChannel).toHaveBeenCalledWith(
        expect.objectContaining({ setup: expect.any(Function) }),
      );
      expect(mockConnectionOn).toHaveBeenCalledWith(
        "connect",
        expect.any(Function),
      );
      expect(mockConnectionOn).toHaveBeenCalledWith(
        "disconnect",
        expect.any(Function),
      );
    });

    it("resolves without waiting for the broker (setup never called)", async () => {
      await expect(createConsumer().onModuleInit()).resolves.toBeUndefined();

      expect(channelSetup).not.toBeNull();
      expect(mockWaitForConnect).not.toHaveBeenCalled();
    });

    it("logs channel errors instead of leaving them unhandled", async () => {
      await createConsumer().onModuleInit();

      const onError = mockWrapperOn.mock.calls.find(
        ([event]) => event === "error",
      );
      expect(onError).toBeDefined();
      expect(() => onError![1](new Error("setup failed"))).not.toThrow();
    });
  });

  describe("channel setup", () => {
    it("sets prefetch 3, asserts a durable queue without priority args and consumes with manual ack", async () => {
      const channel = await startedChannel(createConsumer());

      expect(channel.prefetch).toHaveBeenCalledWith(3);
      expect(channel.assertQueue).toHaveBeenCalledWith(SITES_BUILD_QUEUE, {
        durable: true,
      });
      expect(channel.consume).toHaveBeenCalledWith(
        SITES_BUILD_QUEUE,
        expect.any(Function),
        { noAck: false },
      );
      expect(logSpy).toHaveBeenCalledWith(
        "Build queue consumer started (prefetch: 3)",
      );
    });

    it("re-subscribes on reconnect and acks on the channel the message came from", async () => {
      const consumer = createConsumer();
      const first = await startedChannel(consumer);
      const second = fakeChannel();
      await channelSetup!(second);

      expect(first.consume).toHaveBeenCalledTimes(1);
      expect(second.consume).toHaveBeenCalledTimes(1);
      expect(second.prefetch).toHaveBeenCalledWith(3);

      await onMessageOf(first)(buildMessage({ tenantId: "t1", siteId: "s1" }));

      expect(first.ack).toHaveBeenCalledTimes(1);
      expect(second.ack).not.toHaveBeenCalled();
    });
  });

  describe("message handling", () => {
    it("ignores a null message (consumer cancelled)", async () => {
      const channel = await startedChannel(createConsumer());

      await onMessageOf(channel)(null);

      expect(channel.ack).not.toHaveBeenCalled();
      expect(mockRunBuildPipeline).not.toHaveBeenCalled();
    });

    it.each([
      ["invalid JSON", message("{not json")],
      [
        "unexpected pattern",
        message({
          pattern: "sites.other",
          data: { tenantId: "t", siteId: "s" },
        }),
      ],
      ["missing data", message({ pattern: "sites.build_queued" })],
      ["missing tenantId", buildMessage({ siteId: "s" })],
      ["missing siteId", buildMessage({ tenantId: "t" })],
    ])("acks and discards a message with %s", async (_case, msg) => {
      const channel = await startedChannel(createConsumer());

      await onMessageOf(channel)(msg);

      expect(channel.ack).toHaveBeenCalledWith(msg);
      expect(channel.publish).not.toHaveBeenCalled();
      expect(mockRunBuildPipeline).not.toHaveBeenCalled();
    });

    it("runs the build and acks on success", async () => {
      const { db, update, set, where } = mockDb();
      const channel = await startedChannel(createConsumer(ENABLED_CONFIG, db));
      const msg = buildMessage(
        { tenantId: "t1", siteId: "s1", buildId: "b1", mode: "draft" },
        { priority: 10 },
      );

      await onMessageOf(channel)(msg);

      expect(update).toHaveBeenCalledWith(schema.siteBuild);
      expect(set).toHaveBeenCalledWith({
        retryCount: 0,
        startedAt: expect.any(Date),
      });
      expect(where).toHaveBeenCalled();
      expect(mockRunBuildPipeline).toHaveBeenCalledWith(
        {
          db,
          schema,
          productClient,
          billingClient,
          s3,
          eventsEmit: expect.any(Function),
        },
        { tenantId: "t1", siteId: "s1", mode: "draft" },
      );
      expect(channel.ack).toHaveBeenCalledWith(msg);
      expect(channel.publish).not.toHaveBeenCalled();
    });

    it("defaults mode to production and skips the DB update without buildId", async () => {
      const { db, update } = mockDb();
      const channel = await startedChannel(createConsumer(ENABLED_CONFIG, db));

      await onMessageOf(channel)(
        buildMessage({ tenantId: "t1", siteId: "s1" }),
      );

      expect(update).not.toHaveBeenCalled();
      expect(mockRunBuildPipeline).toHaveBeenCalledWith(expect.anything(), {
        tenantId: "t1",
        siteId: "s1",
        mode: "production",
      });
    });

    it("writes build progress events to the DB", async () => {
      const { db, set } = mockDb();
      const channel = await startedChannel(createConsumer(ENABLED_CONFIG, db));
      mockRunBuildPipeline.mockImplementation(async (deps) => {
        deps.eventsEmit?.("sites.build.progress", {
          buildId: "b1",
          stage: "render",
          percent: 40,
          message: "Rendering",
        });
        deps.eventsEmit?.("sites.build.progress", { stage: "noop" });
        return undefined as any;
      });

      await onMessageOf(channel)(
        buildMessage({ tenantId: "t1", siteId: "s1" }),
      );

      expect(set).toHaveBeenCalledTimes(1);
      expect(set).toHaveBeenCalledWith({
        stage: "render",
        percent: 40,
        message: "Rendering",
      });
    });

    it("routes a failed build to the retry queue via DLX, then acks", async () => {
      const channel = await startedChannel(createConsumer());
      mockRunBuildPipeline.mockRejectedValue(new Error("boom"));
      const previousDeath = { queue: SITES_BUILD_QUEUE, count: 1 };
      const msg = buildMessage(
        { tenantId: "t1", siteId: "s1" },
        { headers: { foo: "bar", "x-death": [previousDeath] }, priority: 5 },
      );

      await onMessageOf(channel)(msg);

      expect(channel.publish).toHaveBeenCalledWith(
        DLX_EXCHANGE,
        RETRY_TIERS[1].queue,
        msg.content,
        {
          persistent: true,
          priority: 5,
          headers: {
            foo: "bar",
            "x-death": [
              previousDeath,
              {
                queue: SITES_BUILD_QUEUE,
                reason: "rejected",
                count: 1,
                time: expect.any(Date),
              },
            ],
            "x-retry-count": 2,
          },
        },
      );
      expect(channel.ack).toHaveBeenCalledWith(msg);
      expect(channel.publish.mock.invocationCallOrder[0]).toBeLessThan(
        channel.ack.mock.invocationCallOrder[0],
      );
    });

    it("routes the first failure to the first retry tier", async () => {
      const channel = await startedChannel(createConsumer());
      mockRunBuildPipeline.mockRejectedValue(new Error("boom"));

      await onMessageOf(channel)(
        buildMessage({ tenantId: "t1", siteId: "s1" }),
      );

      expect(channel.publish).toHaveBeenCalledWith(
        DLX_EXCHANGE,
        RETRY_TIERS[0].queue,
        expect.any(Buffer),
        expect.objectContaining({
          headers: expect.objectContaining({ "x-retry-count": 1 }),
        }),
      );
    });

    it("routes to the dead letter queue when retries are exhausted, then acks", async () => {
      const channel = await startedChannel(createConsumer());
      mockRunBuildPipeline.mockRejectedValue(new Error("boom"));
      const deaths = [{ queue: SITES_BUILD_QUEUE, count: MAX_RETRIES }];
      const msg = buildMessage(
        { tenantId: "t1", siteId: "s1" },
        { headers: { foo: "bar", "x-death": deaths }, priority: 5 },
      );

      await onMessageOf(channel)(msg);

      const [exchange, routingKey, content, options] =
        channel.publish.mock.calls[0];
      expect([exchange, routingKey, content]).toEqual([
        DLX_EXCHANGE,
        DEAD_LETTER_QUEUE,
        msg.content,
      ]);
      expect(options).toStrictEqual({
        persistent: true,
        headers: {
          foo: "bar",
          "x-death": deaths,
          "x-final-error": "boom",
          "x-retry-count": MAX_RETRIES,
        },
      });
      expect(channel.ack).toHaveBeenCalledWith(msg);
      expect(channel.publish.mock.invocationCallOrder[0]).toBeLessThan(
        channel.ack.mock.invocationCallOrder[0],
      );
    });
  });

  describe("closed channel at settle time", () => {
    let unhandled: unknown[];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);

    beforeEach(() => {
      unhandled = [];
      process.on("unhandledRejection", onUnhandled);
    });

    afterEach(() => {
      process.off("unhandledRejection", onUnhandled);
    });

    it("does not throw when ack fails after a successful build", async () => {
      const channel = await startedChannel(createConsumer());
      channel.ack.mockImplementation(() => {
        throw new Error("Channel closed");
      });

      await expect(
        onMessageOf(channel)(buildMessage({ tenantId: "t1", siteId: "s1" })),
      ).resolves.toBeUndefined();
      await flushPromises();

      expect(unhandled).toEqual([]);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Channel closed"),
      );
    });

    it("does not throw when publishing a retry fails", async () => {
      const channel = await startedChannel(createConsumer());
      mockRunBuildPipeline.mockRejectedValue(new Error("boom"));
      channel.publish.mockImplementation(() => {
        throw new Error("Channel closed");
      });

      await expect(
        onMessageOf(channel)(buildMessage({ tenantId: "t1", siteId: "s1" })),
      ).resolves.toBeUndefined();
      await flushPromises();

      expect(unhandled).toEqual([]);
      expect(channel.ack).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Channel closed"),
      );
    });
  });

  describe("onModuleDestroy", () => {
    it("closes the channel wrapper and the connection", async () => {
      const consumer = createConsumer();
      await consumer.onModuleInit();

      await consumer.onModuleDestroy();

      expect(mockWrapperClose).toHaveBeenCalled();
      expect(mockConnectionClose).toHaveBeenCalled();
    });

    it("is a no-op when the consumer never started", async () => {
      const consumer = createConsumer({});
      await consumer.onModuleInit();

      await expect(consumer.onModuleDestroy()).resolves.toBeUndefined();
      expect(mockWrapperClose).not.toHaveBeenCalled();
    });
  });
});

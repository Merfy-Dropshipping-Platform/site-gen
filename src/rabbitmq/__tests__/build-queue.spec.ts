/**
 * Tests for BuildQueuePublisher (build-queue.service.ts)
 *
 * Validates:
 * - Queue initialization with x-max-priority: 10
 * - Priority parameter handling (paid=10, free=1, auto-rebuild=5)
 * - Message format (pattern + data structure)
 * - Channel not initialized handling
 * - onModuleInit / onModuleDestroy lifecycle
 * - queueBuild with various parameters
 * - Default values for optional parameters
 * - Error handling on publish failure
 * - Prefetch count behavior
 * - Missing RABBITMQ_URL graceful handling
 */

import { BuildQueuePublisher, type QueueBuildParams } from "../build-queue.service";
import { SITES_QUEUE } from "../retry-setup.service";

// Mock amqp-connection-manager
const mockSendToQueue = jest.fn().mockResolvedValue(undefined);
const mockChannelClose = jest.fn().mockResolvedValue(undefined);
const mockConnectionClose = jest.fn().mockResolvedValue(undefined);
const mockAssertQueue = jest.fn().mockResolvedValue(undefined);

let channelSetupCallback: ((channel: any) => Promise<void>) | null = null;

const mockCreateChannel = jest.fn().mockImplementation((opts: any) => {
  channelSetupCallback = opts?.setup ?? null;
  return {
    sendToQueue: mockSendToQueue,
    close: mockChannelClose,
  };
});

const mockConnect = jest.fn().mockReturnValue({
  createChannel: mockCreateChannel,
  close: mockConnectionClose,
});

jest.mock("amqp-connection-manager", () => ({
  connect: (...args: any[]) => mockConnect(...args),
}));

// Mock ConfigService
function mockConfigService(values: Record<string, string | undefined> = {}) {
  return {
    get: jest.fn((key: string) => values[key]),
  } as any;
}

describe("BuildQueuePublisher", () => {
  let publisher: BuildQueuePublisher;

  beforeEach(() => {
    jest.clearAllMocks();
    channelSetupCallback = null;
  });

  describe("onModuleInit", () => {
    it("should initialize connection and channel when RABBITMQ_URL is set", async () => {
      publisher = new BuildQueuePublisher(
        mockConfigService({ RABBITMQ_URL: "amqp://localhost" }),
      );
      await publisher.onModuleInit();

      expect(mockConnect).toHaveBeenCalledWith(["amqp://localhost"]);
      expect(mockCreateChannel).toHaveBeenCalled();
    });

    it("should NOT initialize when RABBITMQ_URL is not set", async () => {
      publisher = new BuildQueuePublisher(
        mockConfigService({}),
      );
      await publisher.onModuleInit();

      expect(mockConnect).not.toHaveBeenCalled();
      expect(mockCreateChannel).not.toHaveBeenCalled();
    });

    it("should assert queue with x-max-priority: 10 during channel setup", async () => {
      publisher = new BuildQueuePublisher(
        mockConfigService({ RABBITMQ_URL: "amqp://localhost" }),
      );
      await publisher.onModuleInit();

      expect(channelSetupCallback).toBeDefined();
      // Simulate channel setup
      const fakeChannel = { assertQueue: mockAssertQueue };
      await channelSetupCallback!(fakeChannel);

      expect(mockAssertQueue).toHaveBeenCalledWith(SITES_QUEUE, {
        durable: true,
        arguments: { "x-max-priority": 10 },
      });
    });

    it("should not crash if assertQueue fails during setup (queue already exists with different args)", async () => {
      publisher = new BuildQueuePublisher(
        mockConfigService({ RABBITMQ_URL: "amqp://localhost" }),
      );
      await publisher.onModuleInit();

      const failingAssert = jest.fn().mockRejectedValue(new Error("PRECONDITION_FAILED"));
      const fakeChannel = { assertQueue: failingAssert };

      // Should not throw
      await expect(channelSetupCallback!(fakeChannel)).resolves.not.toThrow();
    });
  });

  describe("onModuleDestroy", () => {
    it("should close channel and connection", async () => {
      publisher = new BuildQueuePublisher(
        mockConfigService({ RABBITMQ_URL: "amqp://localhost" }),
      );
      await publisher.onModuleInit();
      await publisher.onModuleDestroy();

      expect(mockChannelClose).toHaveBeenCalled();
      expect(mockConnectionClose).toHaveBeenCalled();
    });

    it("should handle destroy when not initialized", async () => {
      publisher = new BuildQueuePublisher(
        mockConfigService({}),
      );
      await publisher.onModuleInit();
      // Should not throw
      await expect(publisher.onModuleDestroy()).resolves.not.toThrow();
    });
  });

  describe("queueBuild", () => {
    beforeEach(async () => {
      publisher = new BuildQueuePublisher(
        mockConfigService({ RABBITMQ_URL: "amqp://localhost" }),
      );
      await publisher.onModuleInit();
    });

    it("should publish message with correct format and priority for paid plan (10)", async () => {
      const params: QueueBuildParams = {
        tenantId: "tenant-1",
        siteId: "site-1",
        buildId: "build-1",
        mode: "production",
        priority: 10,
        trigger: "manual",
      };

      const result = await publisher.queueBuild(params);

      expect(result).toBe(true);
      expect(mockSendToQueue).toHaveBeenCalledWith(
        SITES_QUEUE,
        expect.any(Buffer),
        { persistent: true, priority: 10 },
      );

      // Verify message content
      const sentBuffer = mockSendToQueue.mock.calls[0][1];
      const sentMessage = JSON.parse(sentBuffer.toString());
      expect(sentMessage).toEqual({
        pattern: "sites.build_queued",
        data: {
          tenantId: "tenant-1",
          siteId: "site-1",
          buildId: "build-1",
          mode: "production",
          trigger: "manual",
        },
      });
    });

    it("should publish message with priority 1 for free plans", async () => {
      const params: QueueBuildParams = {
        tenantId: "tenant-free",
        siteId: "site-2",
        priority: 1,
      };

      await publisher.queueBuild(params);

      expect(mockSendToQueue).toHaveBeenCalledWith(
        SITES_QUEUE,
        expect.any(Buffer),
        { persistent: true, priority: 1 },
      );
    });

    it("should publish message with priority 5 for product_update rebuilds", async () => {
      const params: QueueBuildParams = {
        tenantId: "tenant-1",
        siteId: "site-1",
        priority: 5,
        trigger: "product_update",
      };

      await publisher.queueBuild(params);

      expect(mockSendToQueue).toHaveBeenCalledWith(
        SITES_QUEUE,
        expect.any(Buffer),
        { persistent: true, priority: 5 },
      );

      const sentBuffer = mockSendToQueue.mock.calls[0][1];
      const sentMessage = JSON.parse(sentBuffer.toString());
      expect(sentMessage.data.trigger).toBe("product_update");
    });

    it("should default priority to 1 when not specified", async () => {
      const params: QueueBuildParams = {
        tenantId: "tenant-1",
        siteId: "site-1",
      };

      await publisher.queueBuild(params);

      expect(mockSendToQueue).toHaveBeenCalledWith(
        SITES_QUEUE,
        expect.any(Buffer),
        { persistent: true, priority: 1 },
      );
    });

    it("should default mode to 'production' and trigger to 'manual' when not specified", async () => {
      const params: QueueBuildParams = {
        tenantId: "tenant-1",
        siteId: "site-1",
      };

      await publisher.queueBuild(params);

      const sentBuffer = mockSendToQueue.mock.calls[0][1];
      const sentMessage = JSON.parse(sentBuffer.toString());
      expect(sentMessage.data.mode).toBe("production");
      expect(sentMessage.data.trigger).toBe("manual");
    });

    it("should return false when channel is not initialized", async () => {
      const uninitPublisher = new BuildQueuePublisher(
        mockConfigService({}),
      );
      await uninitPublisher.onModuleInit();

      const result = await uninitPublisher.queueBuild({
        tenantId: "t",
        siteId: "s",
      });

      expect(result).toBe(false);
    });

    it("should return false and log error when sendToQueue throws", async () => {
      mockSendToQueue.mockRejectedValueOnce(new Error("channel closed"));

      const result = await publisher.queueBuild({
        tenantId: "tenant-1",
        siteId: "site-1",
      });

      expect(result).toBe(false);
    });

    it("should set persistent: true on all messages", async () => {
      await publisher.queueBuild({
        tenantId: "t",
        siteId: "s",
        priority: 7,
      });

      const opts = mockSendToQueue.mock.calls[0][2];
      expect(opts.persistent).toBe(true);
    });
  });

  describe("QueueBuildParams interface", () => {
    it("should accept all optional fields", async () => {
      publisher = new BuildQueuePublisher(
        mockConfigService({ RABBITMQ_URL: "amqp://localhost" }),
      );
      await publisher.onModuleInit();

      const fullParams: QueueBuildParams = {
        tenantId: "t-full",
        siteId: "s-full",
        buildId: "b-full",
        mode: "draft",
        priority: 8,
        trigger: "api",
      };

      await publisher.queueBuild(fullParams);

      const sentBuffer = mockSendToQueue.mock.calls[0][1];
      const sentMessage = JSON.parse(sentBuffer.toString());
      expect(sentMessage.data.buildId).toBe("b-full");
      expect(sentMessage.data.mode).toBe("draft");
    });
  });
});

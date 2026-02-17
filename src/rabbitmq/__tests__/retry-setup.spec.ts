/**
 * Tests for RetrySetupService and helper functions (retry-setup.service.ts)
 *
 * Validates:
 * - DLX exchange declaration (direct type, durable)
 * - 3 retry queues with correct TTL values
 * - Dead letter queue creation and binding
 * - Retry queues route back to SITES_QUEUE on TTL expiry
 * - getRetryRoutingKey: maps retry count to correct queue
 * - getRetryRoutingKey: returns null after MAX_RETRIES
 * - getRetryCountFromHeaders: extracts count from x-death headers
 * - getRetryCountFromHeaders: returns 0 when no headers
 * - MAX_RETRIES constant = 3
 * - SITES_QUEUE and DLX_EXCHANGE constants
 */

import {
  RETRY_TIERS,
  DEAD_LETTER_QUEUE,
  SITES_QUEUE,
  DLX_EXCHANGE,
  MAX_RETRIES,
  getRetryRoutingKey,
  getRetryCountFromHeaders,
  RetrySetupService,
} from "../retry-setup.service";

// Mock amqplib
const mockAssertExchange = jest.fn().mockResolvedValue(undefined);
const mockAssertQueue = jest.fn().mockResolvedValue(undefined);
const mockBindQueue = jest.fn().mockResolvedValue(undefined);
const mockCheckQueue = jest.fn().mockResolvedValue({ queue: SITES_QUEUE });
const mockChannelClose = jest.fn().mockResolvedValue(undefined);
const mockChannel2Close = jest.fn().mockResolvedValue(undefined);
const mockConnectionClose = jest.fn().mockResolvedValue(undefined);

let channelIndex = 0;
const mockCreateChannel = jest.fn().mockImplementation(() => {
  channelIndex++;
  if (channelIndex === 1) {
    return Promise.resolve({
      assertExchange: mockAssertExchange,
      assertQueue: mockAssertQueue,
      bindQueue: mockBindQueue,
      close: mockChannelClose,
    });
  }
  // Second channel is for checkQueue
  return Promise.resolve({
    checkQueue: mockCheckQueue,
    close: mockChannel2Close,
  });
});

const mockConnect = jest.fn().mockResolvedValue({
  createChannel: mockCreateChannel,
  close: mockConnectionClose,
});

jest.mock("amqplib", () => ({
  connect: (...args: any[]) => mockConnect(...args),
}));

// Mock ConfigService
function mockConfigService(values: Record<string, string | undefined> = {}) {
  return {
    get: jest.fn((key: string) => values[key]),
  } as any;
}

describe("RetrySetupService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    channelIndex = 0;
  });

  describe("onModuleInit", () => {
    it("should setup DLX infrastructure when RABBITMQ_URL is set", async () => {
      const service = new RetrySetupService(
        mockConfigService({ RABBITMQ_URL: "amqp://localhost" }),
      );
      await service.onModuleInit();

      expect(mockConnect).toHaveBeenCalledWith("amqp://localhost");
    });

    it("should skip setup when RABBITMQ_URL is not set", async () => {
      const service = new RetrySetupService(mockConfigService({}));
      await service.onModuleInit();

      expect(mockConnect).not.toHaveBeenCalled();
    });

    it("should declare DLX exchange as direct and durable", async () => {
      const service = new RetrySetupService(
        mockConfigService({ RABBITMQ_URL: "amqp://localhost" }),
      );
      await service.onModuleInit();

      expect(mockAssertExchange).toHaveBeenCalledWith(DLX_EXCHANGE, "direct", {
        durable: true,
      });
    });

    it("should declare 3 retry queues with correct TTL values", async () => {
      const service = new RetrySetupService(
        mockConfigService({ RABBITMQ_URL: "amqp://localhost" }),
      );
      await service.onModuleInit();

      // Verify each retry tier queue
      expect(mockAssertQueue).toHaveBeenCalledWith("sites_build_retry_5s", {
        durable: true,
        arguments: {
          "x-message-ttl": 5_000,
          "x-dead-letter-exchange": "",
          "x-dead-letter-routing-key": SITES_QUEUE,
        },
      });

      expect(mockAssertQueue).toHaveBeenCalledWith("sites_build_retry_30s", {
        durable: true,
        arguments: {
          "x-message-ttl": 30_000,
          "x-dead-letter-exchange": "",
          "x-dead-letter-routing-key": SITES_QUEUE,
        },
      });

      expect(mockAssertQueue).toHaveBeenCalledWith("sites_build_retry_120s", {
        durable: true,
        arguments: {
          "x-message-ttl": 120_000,
          "x-dead-letter-exchange": "",
          "x-dead-letter-routing-key": SITES_QUEUE,
        },
      });
    });

    it("should bind retry queues to DLX exchange with queue name as routing key", async () => {
      const service = new RetrySetupService(
        mockConfigService({ RABBITMQ_URL: "amqp://localhost" }),
      );
      await service.onModuleInit();

      for (const tier of RETRY_TIERS) {
        expect(mockBindQueue).toHaveBeenCalledWith(
          tier.queue,
          DLX_EXCHANGE,
          tier.queue,
        );
      }
    });

    it("should declare and bind dead letter queue", async () => {
      const service = new RetrySetupService(
        mockConfigService({ RABBITMQ_URL: "amqp://localhost" }),
      );
      await service.onModuleInit();

      expect(mockAssertQueue).toHaveBeenCalledWith(DEAD_LETTER_QUEUE, {
        durable: true,
      });
      expect(mockBindQueue).toHaveBeenCalledWith(
        DEAD_LETTER_QUEUE,
        DLX_EXCHANGE,
        DEAD_LETTER_QUEUE,
      );
    });

    it("should check sites_queue existence with passive check", async () => {
      const service = new RetrySetupService(
        mockConfigService({ RABBITMQ_URL: "amqp://localhost" }),
      );
      await service.onModuleInit();

      expect(mockCheckQueue).toHaveBeenCalledWith(SITES_QUEUE);
    });

    it("should not crash if connection fails", async () => {
      mockConnect.mockRejectedValueOnce(new Error("connection refused"));
      const service = new RetrySetupService(
        mockConfigService({ RABBITMQ_URL: "amqp://localhost" }),
      );

      // Should not throw
      await expect(service.onModuleInit()).resolves.not.toThrow();
    });

    it("should close connections after setup", async () => {
      const service = new RetrySetupService(
        mockConfigService({ RABBITMQ_URL: "amqp://localhost" }),
      );
      await service.onModuleInit();

      expect(mockChannelClose).toHaveBeenCalled();
      expect(mockConnectionClose).toHaveBeenCalled();
    });
  });
});

describe("RETRY_TIERS constant", () => {
  it("should have 3 tiers", () => {
    expect(RETRY_TIERS).toHaveLength(3);
  });

  it("should have tier 1 at 5s TTL", () => {
    expect(RETRY_TIERS[0]).toEqual({
      queue: "sites_build_retry_5s",
      ttl: 5_000,
    });
  });

  it("should have tier 2 at 30s TTL", () => {
    expect(RETRY_TIERS[1]).toEqual({
      queue: "sites_build_retry_30s",
      ttl: 30_000,
    });
  });

  it("should have tier 3 at 120s TTL", () => {
    expect(RETRY_TIERS[2]).toEqual({
      queue: "sites_build_retry_120s",
      ttl: 120_000,
    });
  });
});

describe("Constants", () => {
  it("MAX_RETRIES should be 3", () => {
    expect(MAX_RETRIES).toBe(3);
  });

  it("SITES_QUEUE should be 'sites_queue'", () => {
    expect(SITES_QUEUE).toBe("sites_queue");
  });

  it("DLX_EXCHANGE should be 'sites_build_dlx'", () => {
    expect(DLX_EXCHANGE).toBe("sites_build_dlx");
  });

  it("DEAD_LETTER_QUEUE should be 'sites_build_dead_letter'", () => {
    expect(DEAD_LETTER_QUEUE).toBe("sites_build_dead_letter");
  });
});

describe("getRetryRoutingKey", () => {
  it("should return sites_build_retry_5s for retryCount=0 (first failure)", () => {
    expect(getRetryRoutingKey(0)).toBe("sites_build_retry_5s");
  });

  it("should return sites_build_retry_30s for retryCount=1 (second failure)", () => {
    expect(getRetryRoutingKey(1)).toBe("sites_build_retry_30s");
  });

  it("should return sites_build_retry_120s for retryCount=2 (third failure)", () => {
    expect(getRetryRoutingKey(2)).toBe("sites_build_retry_120s");
  });

  it("should return null for retryCount=3 (exceeded MAX_RETRIES)", () => {
    expect(getRetryRoutingKey(3)).toBeNull();
  });

  it("should return null for retryCount > MAX_RETRIES", () => {
    expect(getRetryRoutingKey(5)).toBeNull();
    expect(getRetryRoutingKey(100)).toBeNull();
  });
});

describe("getRetryCountFromHeaders", () => {
  it("should return 0 when no headers present", () => {
    expect(getRetryCountFromHeaders({})).toBe(0);
  });

  it("should return 0 when headers is undefined", () => {
    expect(getRetryCountFromHeaders({ headers: undefined } as any)).toBe(0);
  });

  it("should return 0 when x-death is empty array", () => {
    expect(
      getRetryCountFromHeaders({ headers: { "x-death": [] } }),
    ).toBe(0);
  });

  it("should return 0 when x-death is not an array", () => {
    expect(
      getRetryCountFromHeaders({ headers: { "x-death": "not-array" } }),
    ).toBe(0);
  });

  it("should return count from single x-death entry", () => {
    const properties = {
      headers: {
        "x-death": [
          { queue: "sites_build_retry_5s", reason: "rejected", count: 1 },
        ],
      },
    };
    expect(getRetryCountFromHeaders(properties)).toBe(1);
  });

  it("should sum counts across multiple x-death entries", () => {
    const properties = {
      headers: {
        "x-death": [
          { queue: "sites_build_retry_5s", reason: "rejected", count: 1 },
          { queue: "sites_build_retry_30s", reason: "rejected", count: 1 },
        ],
      },
    };
    expect(getRetryCountFromHeaders(properties)).toBe(2);
  });

  it("should handle x-death entries with missing count", () => {
    const properties = {
      headers: {
        "x-death": [{ queue: "sites_build_retry_5s", reason: "rejected" }],
      },
    };
    expect(getRetryCountFromHeaders(properties)).toBe(0);
  });

  it("should handle high retry counts", () => {
    const properties = {
      headers: {
        "x-death": [
          { queue: "sites_build_retry_5s", count: 3 },
          { queue: "sites_build_retry_30s", count: 2 },
          { queue: "sites_build_retry_120s", count: 1 },
        ],
      },
    };
    expect(getRetryCountFromHeaders(properties)).toBe(6);
  });
});

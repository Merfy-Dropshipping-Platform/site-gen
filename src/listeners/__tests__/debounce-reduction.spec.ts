/**
 * Tests for T018: Debounce reduction from 5s to 2s
 *
 * Validates:
 * - DEBOUNCE_MS is 2000 (not 5000)
 * - Build is queued after 2s debounce window
 * - Build is NOT queued after only 1s
 * - Timer resets correctly within the 2s window
 */

import { ProductUpdateListener } from "../product-update.listener";

// Mock amqp-connection-manager
const mockConsume = jest.fn();
const mockAssertExchange = jest.fn().mockResolvedValue(undefined);
const mockAssertQueueResult = { queue: "sites_product_events" };
const mockAssertQueue = jest.fn().mockResolvedValue(mockAssertQueueResult);
const mockBindQueue = jest.fn().mockResolvedValue(undefined);
const mockChannelClose = jest.fn().mockResolvedValue(undefined);
const mockConnectionClose = jest.fn().mockResolvedValue(undefined);

const mockCreateChannel = jest.fn().mockImplementation((opts) => {
  return { close: mockChannelClose };
});

const mockConnectionOn = jest.fn();
const mockConnect = jest.fn().mockReturnValue({
  createChannel: mockCreateChannel,
  close: mockConnectionClose,
  on: mockConnectionOn,
});

jest.mock("amqp-connection-manager", () => ({
  connect: (...args: any[]) => mockConnect(...args),
}));

// Mock timer functions
jest.useFakeTimers();

// Mock BuildQueuePublisher
const mockQueueBuild = jest.fn().mockResolvedValue(true);
const mockBuildQueue = {
  queueBuild: mockQueueBuild,
};

// Mock FragmentPatcher
const mockPatchFragments = jest.fn().mockResolvedValue(undefined);
const mockFragmentPatcher = {
  patchFragments: mockPatchFragments,
};

// Mock ConfigService
function mockConfigService(overrides: Record<string, string> = {}) {
  const defaults: Record<string, string> = {
    PRODUCT_UPDATE_LISTENER_ENABLED: "true",
    RABBITMQ_URL: "amqp://localhost",
  };
  const values = { ...defaults, ...overrides };
  return {
    get: jest.fn((key: string) => values[key]),
  } as any;
}

// Mock DB
function mockDb() {
  const selectResult = {
    from: jest.fn().mockReturnThis(),
    where: jest
      .fn()
      .mockResolvedValue([{ id: "site-1", status: "published" }]),
  };
  return {
    select: jest.fn().mockReturnValue(selectResult),
  } as any;
}

describe("T018: Debounce reduction to 2s", () => {
  let listener: ProductUpdateListener;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    listener = new ProductUpdateListener(
      mockConfigService(),
      mockDb(),
      mockBuildQueue as any,
      mockFragmentPatcher as any,
    );
  });

  afterEach(async () => {
    await listener.onModuleDestroy();
  });

  it("should queue build after 2s debounce (not 5s)", async () => {
    (listener as any).debounceBuild("site-1", "tenant-1", {
      event: "product.updated",
      productIds: ["p1"],
      timestamp: new Date().toISOString(),
    });

    // After 2s, build should fire
    jest.advanceTimersByTime(2_000);
    await Promise.resolve();
    await Promise.resolve();

    expect(mockQueueBuild).toHaveBeenCalledTimes(1);
  });

  it("should NOT queue build after only 1s", async () => {
    (listener as any).debounceBuild("site-1", "tenant-1", {
      event: "product.updated",
      productIds: ["p1"],
      timestamp: new Date().toISOString(),
    });

    // After 1s, build should NOT fire yet
    jest.advanceTimersByTime(1_000);
    await Promise.resolve();
    await Promise.resolve();

    expect(mockQueueBuild).not.toHaveBeenCalled();
  });

  it("should reset timer within 2s window", async () => {
    (listener as any).debounceBuild("site-1", "tenant-1", {
      event: "product.updated",
      productIds: ["p1"],
      timestamp: new Date().toISOString(),
    });

    // After 1.5s, send another event
    jest.advanceTimersByTime(1_500);

    (listener as any).debounceBuild("site-1", "tenant-1", {
      event: "product.updated",
      productIds: ["p2"],
      timestamp: new Date().toISOString(),
    });

    // After 1.5s more (3s total, but only 1.5s from last event) — should NOT fire
    jest.advanceTimersByTime(1_500);
    await Promise.resolve();
    await Promise.resolve();

    expect(mockQueueBuild).not.toHaveBeenCalled();

    // After another 0.5s (2s from last event) — should fire
    jest.advanceTimersByTime(500);
    await Promise.resolve();
    await Promise.resolve();

    expect(mockQueueBuild).toHaveBeenCalledTimes(1);
  });
});

/**
 * Копия sites на общем брокере (стенд) не должна задевать основную среду:
 * без env — прежние имена и поведение, с env — свои очереди и тишина в user_queue.
 */
import {
  sitesBillingEventsQueue,
  sitesBuildQueue,
  sitesQueue,
  userEventsEnabled,
} from "../constants";

const KEYS = [
  "SITES_QUEUE",
  "SITES_BILLING_EVENTS_QUEUE",
  "SITES_BUILD_QUEUE",
  "SITES_USER_EVENTS_ENABLED",
] as const;

describe("изоляция копии sites на общем брокере", () => {
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => KEYS.forEach((k) => ((saved[k] = process.env[k]), delete process.env[k])));
  afterEach(() =>
    KEYS.forEach((k) => (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]))),
  );

  it("без env — прежние имена и события в user_queue", () => {
    expect(sitesQueue()).toBe("sites_queue");
    expect(sitesBillingEventsQueue()).toBe("sites_billing_events");
    expect(sitesBuildQueue()).toBe("sites_build_queue");
    expect(userEventsEnabled()).toBe(true);
  });

  it("стенд получает свои очереди и глушит user_queue", () => {
    process.env.SITES_QUEUE = "sites_queue_stage23";
    process.env.SITES_BILLING_EVENTS_QUEUE = "sites_billing_events_stage23";
    process.env.SITES_BUILD_QUEUE = "sites_build_queue_stage23";
    process.env.SITES_USER_EVENTS_ENABLED = "false";
    expect(sitesQueue()).toBe("sites_queue_stage23");
    expect(sitesBillingEventsQueue()).toBe("sites_billing_events_stage23");
    expect(sitesBuildQueue()).toBe("sites_build_queue_stage23");
    expect(userEventsEnabled()).toBe(false);
  });
});

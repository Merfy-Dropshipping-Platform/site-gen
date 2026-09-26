import { buildEnvForThemes, resolveApiUrl } from "../api-url";

describe("resolveApiUrl", () => {
  it("дефолт — прод", () => expect(resolveApiUrl({})).toBe("https://gateway.merfy.ru/api"));
  it("добавляет /api и режет слэш", () =>
    expect(resolveApiUrl({ API_GATEWAY_URL: "https://gateway.dev.merfy.ru/" })).toBe("https://gateway.dev.merfy.ru/api"));
  it("не дублирует /api", () => expect(resolveApiUrl({ API_GATEWAY_URL: "https://x/api" })).toBe("https://x/api"));
  it("env для тем", () =>
    expect(buildEnvForThemes({ API_GATEWAY_URL: "https://gateway.dev.merfy.ru" })).toEqual({
      PUBLIC_MERFY_API_URL: "https://gateway.dev.merfy.ru/api",
      PUBLIC_MERFY_API_BASE: "https://gateway.dev.merfy.ru",
    }));
});

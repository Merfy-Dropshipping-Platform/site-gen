/**
 * Адрес API для витрин: из API_GATEWAY_URL, всегда с /api; дефолт — прод.
 * Один источник для scaffold, build и astro-сборки (spec 116: контур из env, прод-поведение прежнее).
 */
export const DEFAULT_API_URL = "https://gateway.merfy.ru/api";

export function resolveApiUrl(env: NodeJS.ProcessEnv = process.env): string {
  const raw = (env.API_GATEWAY_URL ?? "").trim().replace(/\/+$/, "");
  if (!raw) return DEFAULT_API_URL;
  return raw.endsWith("/api") ? raw : `${raw}/api`;
}

/** Переменные для сборки Astro: темы читают import.meta.env.PUBLIC_MERFY_API_URL. */
export function buildEnvForThemes(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const apiUrl = resolveApiUrl(env);
  return { PUBLIC_MERFY_API_URL: apiUrl, PUBLIC_MERFY_API_BASE: apiUrl.replace(/\/api$/, "") };
}

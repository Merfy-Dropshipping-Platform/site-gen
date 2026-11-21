/**
 * «Дизайн по ссылке» (21.11): RPC sites_queue `design.*` — снимки дизайна и учёт «сайт мой». Контракт —
 * reports/vizi-design-copy/contract.md, раздел 3; зовёт шлюз (api-gateway src/sites/design/site-design.service.ts).
 *
 * - design.saveLook { siteId, url, finalUrl, tool, toolVersion, outlineTool, style, outline, content, raw, ms } → { id };
 * - design.getLook { siteId, lookId } → { id, url, style, outline, content, createdAt } (без tool, toolVersion, raw);
 *   записи нет — success: false;
 * - design.findRecent { siteId, url, maxAgeMs } → та же строка или null;
 * - design.confirmOwned { siteId, domain, userId } → { ok: true };
 * - design.isOwned { siteId, domain } → { owned: boolean }.
 *
 * Ответ — { success, data?, error? }, error — строка. Тенант в сообщения не входит: магазин шлюз уже сверил с
 * организацией сессии. Домен — нижний регистр, без www. и точки в конце (так нормализует шлюз; здесь то же правило
 * повторно — оно не меняет уже нормального домена).
 */
import { z } from "zod";

export const SAVE_LOOK_PATTERN = "design.saveLook";
export const GET_LOOK_PATTERN = "design.getLook";
export const FIND_RECENT_PATTERN = "design.findRecent";
export const CONFIRM_OWNED_PATTERN = "design.confirmOwned";
export const IS_OWNED_PATTERN = "design.isOwned";

/** Сколько живёт снимок: старше — чистка раз в сутки. */
export const LOOK_RETENTION_DAYS = 30;
/** Сырой ответ инструмента больше этого не храним целиком (проверяющий процесс режет до 512 КБ). */
export const RAW_LIMIT_BYTES = 1024 * 1024;
const URL_MAX = 2000;

const id = z.string().min(1).max(100);
const json = z.record(z.string(), z.unknown());
const webUrl = z
  .string()
  .max(URL_MAX)
  .refine(
    (value) =>
      URL.canParse(value) &&
      ["http:", "https:"].includes(new URL(value).protocol),
    "нужен http(s)-адрес",
  );

/** Домен в том виде, в каком его хранит design_owned_sites. */
export const normalizeDomain = (raw: string): string =>
  raw
    .trim()
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^www\./, "");

const domain = z
  .string()
  .min(1)
  .max(253)
  .transform(normalizeDomain)
  .refine(
    (value) => /^[a-z0-9.-]+$/.test(value) && value.includes("."),
    "не домен",
  );

export const SaveLookSchema = z.object({
  siteId: id,
  url: webUrl,
  finalUrl: webUrl,
  tool: z.string().min(1).max(60),
  toolVersion: z.string().min(1).max(60),
  outlineTool: z.string().min(1).max(60),
  style: json,
  outline: json,
  content: json.nullable(),
  raw: json,
  ms: z
    .number()
    .int()
    .min(0)
    .max(10 * 60 * 1000),
});
export type SaveLookInput = z.infer<typeof SaveLookSchema>;

export const GetLookSchema = z.object({ siteId: id, lookId: z.uuid() });
export const FindRecentSchema = z.object({
  siteId: id,
  url: webUrl,
  maxAgeMs: z
    .number()
    .int()
    .positive()
    .max(LOOK_RETENTION_DAYS * 24 * 60 * 60 * 1000),
});
export const ConfirmOwnedSchema = z.object({ siteId: id, domain, userId: id });
export const IsOwnedSchema = z.object({ siteId: id, domain });

/** Строка снимка наружу: без tool, toolVersion, raw. */
export interface StoredLook {
  id: string;
  url: string;
  style: Record<string, unknown>;
  outline: Record<string, unknown>;
  content: Record<string, unknown> | null;
  createdAt: string;
}

export type DesignRpcReply<T> =
  | { success: true; data: T }
  | { success: false; error: string };

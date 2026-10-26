/**
 * Копия: extensions, src/sites/extension-sections.contract.ts; обе копии проходят
 * __tests__/fixtures/extension-sections.examples.json — один файл, байт в байт.
 *
 * 1. RPC sites.extension.section.accept (sites_queue): при регистрации версии
 *    расширения сервис extensions отправляет каждую секцию и каждый
 *    глобальный скрипт манифеста; sites сохраняет его способом extension
 *    (release — версия расширения) и отвечает итогом. Хоть один не сохранён —
 *    версия не регистрируется.
 * 2. Событие sites.extension.toggled (sites_queue, без ответа): после enable и
 *    disable установки — sites ставит пересборку магазина (extension-toggle).
 * 3. Ответ контейнера на GET <адрес>/sections/<имя>: { files: { путь: текст } }.
 */
import { z } from "zod";

export const SECTION_ACCEPT_PATTERN = "sites.extension.section.accept";
export const EXTENSION_TOGGLED_PATTERN = "sites.extension.toggled";
/** Файлы одной секции, путь и текст в UTF-8 — до 512 КБ (предел тела сборщика). */
export const SECTION_FILES_LIMIT_BYTES = 512 * 1024;

const EXTENSION_ID_RE = /^[a-z][a-z0-9-]{2,31}$/;
/** Имя секции без id расширения — SECTION_ID site-gen (storefront-sections, format.ts). */
export const SECTION_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Версия способа сохранения extension — semver без «+сборки» (site-gen, doors.ts). */
const RELEASE_RE = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/;

export const SectionFilesSchema = z.record(
  z.string().min(1).max(200),
  z.string(),
);
export type SectionFiles = z.infer<typeof SectionFilesSchema>;

export const SectionAcceptRequestSchema = z.strictObject({
  extensionId: z.string().regex(EXTENSION_ID_RE),
  release: z.string().regex(RELEASE_RE),
  kind: z.enum(["section", "global"]),
  name: z.string().max(40).regex(SECTION_NAME_RE),
  files: SectionFilesSchema,
});
export type SectionAcceptRequest = z.infer<typeof SectionAcceptRequestSchema>;

const ProblemSchema = z.object({
  code: z.string().min(1),
  file: z.string(),
  line: z.number().int().positive().nullable(),
  column: z.number().int().positive().nullable(),
  message: z.string().min(1),
});
export type SectionProblemReply = z.infer<typeof ProblemSchema>;

/** Не сохранено не из-за проверки: тело, песочница, сборщик, сбой. */
export const FAILURE_CODES = [
  "body-invalid",
  "uploads-closed",
  "builder-unavailable",
  "tool-failed",
] as const;
export type FailureCode = (typeof FAILURE_CODES)[number];

const SavedReplySchema = z.object({
  success: z.literal(true),
  data: z.object({
    status: z.enum(["accepted", "unchanged"]),
    /** Полное имя: <id расширения>:<имя>. */
    name: z.string().min(1),
    /** id строки storefront_section. */
    id: z.string().min(1),
  }),
});

const RefusedReplySchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.literal("refused"),
    message: z.string(),
    problems: z.array(ProblemSchema).min(1),
  }),
});

const FailedReplySchema = z.object({
  success: z.literal(false),
  error: z.object({ code: z.enum(FAILURE_CODES), message: z.string() }),
});

export const SectionAcceptReplySchema = z.union([
  SavedReplySchema,
  RefusedReplySchema,
  FailedReplySchema,
]);
export type SectionAcceptReply = z.infer<typeof SectionAcceptReplySchema>;

export const ExtensionToggledSchema = z.strictObject({
  shopId: z.uuid(),
  extensionId: z.string().regex(EXTENSION_ID_RE),
  state: z.enum(["enabled", "disabled"]),
});
export type ExtensionToggled = z.infer<typeof ExtensionToggledSchema>;

export const ContainerSectionSchema = z.strictObject({
  files: SectionFilesSchema,
});

export type SectionFilesRead =
  | { ok: true; files: SectionFiles }
  | { ok: false; message: string };

const bytesOf = (files: SectionFiles): number =>
  Object.entries(files).reduce(
    (sum, [path, text]) =>
      sum + Buffer.byteLength(path) + Buffer.byteLength(text),
    0,
  );

/** Ответ контейнера → файлы секции; не той формы или больше предела — причина. */
export function readSectionFiles(raw: unknown): SectionFilesRead {
  const parsed = ContainerSectionSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: "ответ не { files: { путь: текст } }" };
  }
  const bytes = bytesOf(parsed.data.files);
  if (bytes > SECTION_FILES_LIMIT_BYTES) {
    return {
      ok: false,
      message: `файлы — ${bytes} Б, больше предела ${SECTION_FILES_LIMIT_BYTES} Б`,
    };
  }
  return { ok: true, files: parsed.data.files };
}

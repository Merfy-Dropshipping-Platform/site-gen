/**
 * extension-upload — файл покупателя в хранилище расширения, три шага
 * (спека 121 §5):
 *   1. шлюз: `POST /store/extensions/:id/files` {kind, name, size, mime} →
 *      {fileId, upload: {url, fields}} — подписанная форма хранилища;
 *   2. хранилище: `POST upload.url`, multipart — поля формы, файл последним.
 *      Одним запросом, видео тоже: частями не грузим (решение Р5 спеки 120);
 *   3. шлюз: `POST /store/extensions/:id/files/:fileId/complete` →
 *      {status: "ready"} или {status: "rejected", reason}: ядро проверило
 *      размер и формат по первым байтам.
 *
 * Вид файла (`kind`) — тип файлового пункта формы: `photo`, `video`, `file`.
 * Пределы и форматы — FILE_LIMITS копии пакета форм; окончательно решает ядро
 * по манифесту расширения. Успех шагов 1 и 3 — любой 2xx (шлюз отвечает 201),
 * шага 2 — тоже (хранилище отвечает 204).
 *
 * Слов предметной области в файле нет: загрузкой пользуется любое расширение.
 */
import { FILE_LIMITS } from "./forms-vendor/file-limits";
import {
  isRecord,
  isSuccessStatus,
  postToExtension,
  replyData,
  type ExtensionChannel,
  type FunctionReply,
} from "./extension-call";

export type UploadType = "photo" | "video" | "file";

/** Почему файл не годится: формат, размер или пустой файл. Повтор не поможет. */
export type RejectReason = "format" | "size" | "empty";

export type UploadOutcome =
  | { kind: "ready"; fileId: string }
  | { kind: "rejected"; reason: RejectReason }
  | { kind: "failed" };

/** Размер, имя и тип файла — всё, что нужно проверкам (File подходит). */
export interface FileFacts {
  name: string;
  type: string;
  size: number;
}

const MB = 1024 * 1024;
/** Предел имени файла в шлюзе (DTO шага 1). */
const NAME_MAX = 255;
const FAILED: UploadOutcome = { kind: "failed" };

/** Тип по расширению имени: браузер на компьютере часто не знает HEIC и даёт пустой тип. */
const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  heic: "image/heic",
  heif: "image/heic",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  mov: "video/quicktime",
  pdf: "application/pdf",
  zip: "application/zip",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

/** Форматы, которые браузер умеет показать картинкой. HEIC — без превью (решение Р4). */
const PREVIEW_MIMES: readonly string[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

/** Отказы шлюза на шаге 1, которые повтор не исправит. */
const START_REJECTS: Record<string, RejectReason> = {
  too_large: "size",
  mime_not_allowed: "format",
  invalid_kind: "format",
};

/** Причина отказа ядра на шаге 3. */
const VERDICT_REJECTS: Record<string, RejectReason> = {
  too_large: "size",
  wrong_type: "format",
};

const hasOwn = (object: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(object, key);

/** Расширение имени строчными, без точки; нет точки — пусто. */
export const fileExtension = (name: string): string => {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot + 1).toLowerCase();
};

/** Тип файла для шага 1: по расширению имени, а если оно незнакомо — как сказал браузер. */
export function fileMime(file: Pick<FileFacts, "name" | "type">): string {
  const extension = fileExtension(file.name);
  return hasOwn(MIME_BY_EXTENSION, extension)
    ? MIME_BY_EXTENSION[extension]
    : file.type;
}

export const canPreview = (file: Pick<FileFacts, "name" | "type">): boolean =>
  PREVIEW_MIMES.includes(fileMime(file));

/** Подходит ли формат пункту: тип или расширение имени есть в FILE_LIMITS[type].accept. */
function fitsFormat(type: UploadType, file: FileFacts): boolean {
  const accept: readonly string[] = FILE_LIMITS[type].accept;
  return (
    accept.includes(fileMime(file)) ||
    accept.includes(`.${fileExtension(file.name)}`)
  );
}

/** Проверки до загрузки — по порядку; первая сработавшая и есть причина. */
const LOCAL_CHECKS: readonly {
  reason: RejectReason;
  broken: (type: UploadType, file: FileFacts) => boolean;
}[] = [
  { reason: "empty", broken: (_type, file) => file.size === 0 },
  { reason: "format", broken: (type, file) => !fitsFormat(type, file) },
  {
    reason: "size",
    broken: (type, file) => file.size > FILE_LIMITS[type].maxMb * MB,
  },
];

/** Что мешает загрузить файл в пункт этого типа; `null` — можно грузить. */
export function fileProblem(
  type: UploadType,
  file: FileFacts,
): RejectReason | null {
  const broken = LOCAL_CHECKS.find((check) => check.broken(type, file));
  return broken === undefined ? null : broken.reason;
}

/* ── Разбор ответов шлюза ── */

interface UploadForm {
  fileId: string;
  url: string;
  fields: Array<[string, string]>;
}

const isTextPair = (pair: [string, unknown]): pair is [string, string] =>
  typeof pair[1] === "string";

/** Шаг 1: {fileId, upload: {url, fields}}; не та форма — `null`. */
export function uploadFormOf(reply: FunctionReply | null): UploadForm | null {
  const data = replyData(reply);
  if (!isRecord(data) || typeof data.fileId !== "string") return null;
  const upload = isRecord(data.upload) ? data.upload : {};
  const { url, fields } = upload;
  if (typeof url !== "string" || !isRecord(fields)) return null;
  const pairs = Object.entries(fields);
  const textPairs = pairs.filter(isTextPair);
  if (textPairs.length !== pairs.length) return null;
  return { fileId: data.fileId, url, fields: textPairs };
}

/** Шаг 1 не дал формы: отказ по коду шлюза или сбой (его можно повторить). */
export function startFailure(reply: FunctionReply | null): UploadOutcome {
  const body = reply === null ? null : reply.body;
  const code = isRecord(body) ? body.code : undefined;
  if (typeof code !== "string" || !hasOwn(START_REJECTS, code)) return FAILED;
  return { kind: "rejected", reason: START_REJECTS[code] };
}

const verdictReason = (reason: unknown): RejectReason =>
  typeof reason === "string" && hasOwn(VERDICT_REJECTS, reason)
    ? VERDICT_REJECTS[reason]
    : "format";

/** Шаг 3: ready — файл готов; rejected — отказ с причиной; остальное — сбой. */
export function verdictOf(
  reply: FunctionReply | null,
  fileId: string,
): UploadOutcome {
  const data = replyData(reply);
  if (!isRecord(data) || data.fileId !== fileId) return FAILED;
  if (data.status === "ready") return { kind: "ready", fileId };
  return data.status === "rejected"
    ? { kind: "rejected", reason: verdictReason(data.reason) }
    : FAILED;
}

/* ── Сеть ── */

/** Шаг 2: поля подписанной формы, файл — последним (хранилище читает поля до файла). */
async function sendToStorage(form: UploadForm, file: Blob): Promise<boolean> {
  const body = new FormData();
  form.fields.forEach(([name, value]) => body.append(name, value));
  body.append("file", file);
  try {
    const response = await fetch(form.url, {
      method: "POST",
      body,
      credentials: "omit",
    });
    return isSuccessStatus(response.status);
  } catch {
    // Сеть оборвалась: файл не дошёл, загрузку можно повторить.
    return false;
  }
}

/** Три шага загрузки одного файла. Сбой сети или шлюза — `failed`, его можно повторить. */
export async function uploadFile(
  channel: ExtensionChannel,
  extensionId: string,
  type: UploadType,
  file: File,
): Promise<UploadOutcome> {
  const start = await postToExtension(channel, extensionId, "files", {
    kind: type,
    name: file.name.slice(0, NAME_MAX) || type,
    size: file.size,
    mime: fileMime(file),
  });
  const form = uploadFormOf(start);
  if (form === null) return startFailure(start);
  if (!(await sendToStorage(form, file))) return FAILED;
  const tail = `files/${encodeURIComponent(form.fileId)}/complete`;
  const done = await postToExtension(channel, extensionId, tail, {});
  return verdictOf(done, form.fileId);
}

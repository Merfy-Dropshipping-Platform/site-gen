/**
 * extension-purchase-files — файловые пункты формы покупки: какие файлы
 * выбраны, какие уже в хранилище, что уходит в отправку, и разметка плитки
 * выбора с выбранными файлами. Сеть — `extension-upload.ts`, события и DOM —
 * `extension-purchase.ts`.
 *
 * Как в прототипе PM: фото — плитками с превью и «×», видео и документы —
 * строкой с названием и «убрать». HEIC — без превью (решение Р4: браузеры,
 * кроме Safari, его не показывают) — на плитке расширение имени. Когда файлов
 * столько, сколько разрешает пункт, плитка выбора пропадает; до этого после
 * первого файла она зовёт «Добавить ещё» и считает «выбрано N».
 *
 * Слов предметной области в файле нет: форма — общая для любого расширения.
 */
import { FILE_LIMITS } from "./forms-vendor/file-limits";
import type { FieldItem, FormItem } from "./forms-vendor/types-v2";
import { maxFilesText } from "./forms-vendor/value-checks";
import { attribute, escapeHtml } from "./extension-call";
import {
  fileExtension,
  fileProblem,
  type FileFacts,
  type RejectReason,
  type UploadOutcome,
  type UploadType,
} from "./extension-upload";

export type UploadStatus = "loading" | "ready" | "failed";

/** Выбранный файл пункта: от выбора до готовности в хранилище. */
export interface UploadEntry {
  /** Номер файла в форме: по нему кнопка «Убрать файл» находит запись. */
  key: string;
  type: UploadType;
  file: File;
  status: UploadStatus;
  /** id файла в хранилище; пусто, пока файл не готов. */
  fileId: string;
  /** Ссылка на превью (`blob:`); пусто — без превью. */
  preview: string;
  /** Последняя загрузка файла: перед отправкой форма ждёт её. */
  job: Promise<void>;
}

/** Выбранные файлы по id пункта. */
export type FileEntries = Record<string, UploadEntry[]>;

/** Файл на своём месте: пункт и запись. */
export interface PlacedEntry {
  itemId: string;
  entry: UploadEntry;
}

export type UploadField = FieldItem & { type: UploadType };

export interface PickResult<T> {
  accepted: T[];
  /** Почему часть файлов не взяли; пусто — взяли все. */
  problem: string;
}

const UPLOAD_TYPES: readonly string[] = ["photo", "video", "file"];

const UPLOAD_TITLES: Record<UploadType, string> = {
  photo: "Выбрать фото",
  video: "Выбрать видео",
  file: "Выбрать файл",
};
const UPLOAD_ICONS: Record<UploadType, string> = {
  photo: "▣",
  video: "▶",
  file: "⎘",
};
/** Форматы по решению Р11 (Б): совпадают с `FILE_LIMITS[..].accept`. */
const UPLOAD_FORMATS: Record<UploadType, string> = {
  photo: "JPEG, PNG, HEIC, WebP или GIF",
  video: "MP4 или MOV",
  file: "PDF, ZIP, DOCX, XLSX или PPTX",
};
/** Значок перед названием файла в строке (как в прототипе: у видео «▶»). */
const ROW_ICONS: Record<UploadType, string> = {
  photo: "",
  video: "▶ ",
  file: "",
};

export const FILE_TEXTS = {
  more: "Добавить ещё",
  chosen: "выбрано",
  remove: "Убрать файл",
  removeShort: "убрать",
  notUploaded: "Файл не загрузился. Отправьте ещё раз или уберите его",
  total: `Файлы вместе больше ${FILE_LIMITS.perRequestGb} ГБ`,
} as const;

/** Пометка у файла, пока он не готов. */
const STATUS_NOTES: Record<UploadStatus, string> = {
  loading: "загружается",
  ready: "",
  failed: "не загрузился",
};

const REJECT_TEXTS: Record<
  RejectReason,
  (name: string, type: UploadType) => string
> = {
  format: (name) => `«${name}»: такой формат не подходит`,
  size: (name, type) => `«${name}»: больше ${FILE_LIMITS[type].maxMb} МБ`,
  empty: (name) => `«${name}»: файл пустой`,
};

const MAX_TOTAL_BYTES = FILE_LIMITS.perRequestGb * 1024 * 1024 * 1024;

const hasOwn = (object: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(object, key);

/** Сколько файлов можно в пункт; не сказано — один (как подсказка «до 1»). */
const maxOf = (field: UploadField): number => field.maxFiles ?? 1;

/* ── Состояние файлов ── */

export const isUploadField = (item: FormItem): item is UploadField =>
  item.kind === "field" && UPLOAD_TYPES.includes(item.type);

/** Файловый пункт формы по id; другой пункт или нет такого — `null`. */
export function uploadFieldOf(
  items: readonly FormItem[],
  id: string | undefined,
): UploadField | null {
  const item = items.find((one) => one.id === id);
  return item !== undefined && isUploadField(item) ? item : null;
}

/** Файлы пункта; id из данных расширения, поэтому только свои ключи объекта. */
export const entriesOf = (files: FileEntries, itemId: string): UploadEntry[] =>
  hasOwn(files, itemId) ? files[itemId] : [];

export const placedEntries = (files: FileEntries): PlacedEntry[] =>
  Object.entries(files).flatMap(([itemId, entries]) =>
    entries.map((entry) => ({ itemId, entry })),
  );

/** Файлы, которые ещё не в хранилище: грузятся или не загрузились. */
export const pendingUploads = (files: FileEntries): PlacedEntry[] =>
  placedEntries(files).filter(({ entry }) => entry.status !== "ready");

export const findEntry = (
  files: FileEntries,
  key: string,
): PlacedEntry | null =>
  placedEntries(files).find(({ entry }) => entry.key === key) ?? null;

/** Сколько файлов у пункта — для проверки формы (обязательность, maxFiles). */
export const fileCounts = (files: FileEntries): Record<string, number> =>
  Object.fromEntries(
    Object.entries(files).map(([itemId, entries]) => [itemId, entries.length]),
  );

/** id готовых файлов по пунктам; пункты без готовых файлов не попадают. */
export function readyFileIds(files: FileEntries): Record<string, string[]> {
  const ids = Object.entries(files).map(([itemId, entries]) => {
    const ready = entries.filter((entry) => entry.status === "ready");
    return [itemId, ready.map((entry) => entry.fileId)] as const;
  });
  return Object.fromEntries(ids.filter(([, list]) => list.length > 0));
}

const totalBytes = (files: FileEntries): number =>
  placedEntries(files).reduce((sum, { entry }) => sum + entry.file.size, 0);

interface Room {
  slots: number;
  bytes: number;
}

function pickProblem(
  field: UploadField,
  file: FileFacts,
  room: Room,
): string | null {
  const reason = fileProblem(field.type, file);
  if (reason !== null) return REJECT_TEXTS[reason](file.name, field.type);
  if (room.slots <= 0)
    return maxFilesText({ ...field, maxFiles: maxOf(field) });
  return room.bytes + file.size > MAX_TOTAL_BYTES ? FILE_TEXTS.total : null;
}

/**
 * Какие из выбранных файлов берём: годные по формату и размеру, в пределах
 * maxFiles пункта и 2 ГБ на всю форму. Причину первого отказа показываем у пункта.
 */
export function pickFiles<T extends FileFacts>(
  field: UploadField,
  picked: readonly T[],
  files: FileEntries,
): PickResult<T> {
  const room: Room = {
    slots: maxOf(field) - entriesOf(files, field.id).length,
    bytes: totalBytes(files),
  };
  const accepted: T[] = [];
  let problem = "";
  for (const file of picked) {
    const found = pickProblem(field, file, room);
    problem = problem || (found ?? "");
    if (found !== null) continue;
    accepted.push(file);
    room.slots -= 1;
    room.bytes += file.size;
  }
  return { accepted, problem };
}

/**
 * Итог загрузки → запись: готов (с id из хранилища) или не загрузился.
 * Отклонённый файл возвращает текст для пункта — его убирают из формы.
 */
export function applyOutcome(
  entry: UploadEntry,
  outcome: UploadOutcome,
): string {
  entry.status = outcome.kind === "ready" ? "ready" : "failed";
  entry.fileId = outcome.kind === "ready" ? outcome.fileId : "";
  return outcome.kind === "rejected"
    ? REJECT_TEXTS[outcome.reason](entry.file.name, entry.type)
    : "";
}

/* ── Разметка (строки; имена файлов экранируются) ── */

/** Подсказка у плитки файла: форматы, лимит из FILE_LIMITS, сколько файлов. */
export function uploadHint(
  type: UploadType,
  maxFiles: number | undefined,
): string {
  return `${UPLOAD_FORMATS[type]} до ${FILE_LIMITS[type].maxMb} МБ · до ${maxFiles ?? 1}`;
}

const lookOf = (base: string, entry: UploadEntry): string =>
  entry.status === "ready" ? base : `${base} ${entry.status}`;

const removeHtml = (entry: UploadEntry, label: string): string =>
  `<button type="button"${attribute("data-xp-remove", entry.key)}${attribute("aria-label", FILE_TEXTS.remove)}>${label}</button>`;

function thumbHtml(entry: UploadEntry): string {
  const picture =
    entry.preview === ""
      ? `<span>${escapeHtml(fileExtension(entry.file.name).toUpperCase())}</span>`
      : `<img alt=""${attribute("src", entry.preview)}>`;
  const note = STATUS_NOTES[entry.status];
  const noteHtml = note === "" ? "" : `<small>${note}</small>`;
  return `<div class="${lookOf("sf-thumb", entry)}"${attribute("title", entry.file.name)}>${picture}${noteHtml}${removeHtml(entry, "×")}</div>`;
}

function fileRowHtml(entry: UploadEntry): string {
  const note = STATUS_NOTES[entry.status];
  const noteText = note === "" ? "" : ` · ${note}`;
  const name = `${ROW_ICONS[entry.type]}${escapeHtml(entry.file.name)}${noteText}`;
  return `<div class="${lookOf("sf-fl", entry)}"><span>${name}</span>${removeHtml(entry, FILE_TEXTS.removeShort)}</div>`;
}

/** Выбранные файлы: фото — сеткой плиток, остальное — строками. */
const ENTRY_LISTS: Record<UploadType, (entries: UploadEntry[]) => string> = {
  photo: (entries) =>
    entries.length === 0
      ? ""
      : `<div class="sf-th">${entries.map(thumbHtml).join("")}</div>`,
  video: (entries) => entries.map(fileRowHtml).join(""),
  file: (entries) => entries.map(fileRowHtml).join(""),
};

/** Плитка выбора: пропадает, когда файлов уже столько, сколько разрешает пункт. */
function pickerHtml(
  field: UploadField,
  entries: UploadEntry[],
  bad: boolean,
): string {
  const count = entries.length;
  if (count >= maxOf(field)) return "";
  const accept = attribute("accept", FILE_LIMITS[field.type].accept.join(","));
  const multiple = maxOf(field) > 1 ? " multiple" : "";
  const input = `<input type="file"${attribute("data-xp-file", field.id)}${accept}${multiple}>`;
  const title = count > 0 ? FILE_TEXTS.more : UPLOAD_TITLES[field.type];
  const chosen = count > 0 ? ` · ${FILE_TEXTS.chosen} ${count}` : "";
  const hint = escapeHtml(uploadHint(field.type, field.maxFiles) + chosen);
  const caption = `<span><b>${title}</b><small>${hint}</small></span>`;
  const icon = `<span class="ic" aria-hidden="true">${UPLOAD_ICONS[field.type]}</span>`;
  return `<label class="${bad ? "sf-up bad" : "sf-up"}">${input}${icon}${caption}</label>`;
}

/** Плитка выбора и выбранные файлы пункта — то, что стоит между названием пункта и ошибкой. */
export function uploadControlHtml(
  field: UploadField,
  entries: UploadEntry[],
  bad: boolean,
): string {
  return pickerHtml(field, entries, bad) + ENTRY_LISTS[field.type](entries);
}

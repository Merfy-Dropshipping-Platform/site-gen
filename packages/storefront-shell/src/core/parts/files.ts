import { tokenOf } from '../customer-token';
import { elementOf } from '../el';
import { failureOf, failed, reasonOf, reportFailure, serverCodeOf, type Failure, type Reply } from '../failures';
import { requestJson } from '../requests';
import { pageStorage, type KeyValue } from '../storage';
import type {
  ActionOptions,
  ChosenFile,
  CoreHandle,
  El,
  FilesModule,
  Result,
  SdkPart,
  UploadArgs,
  UploadDone,
} from '../types';

// Часть files (блок 12 «Секций и SDK», часть 12е, Р12е-2): файлы покупательницы для форм расширений — выбор из
// <input type="file">, загрузка в хранилище расширения в три шага (шлюз → хранилище → шлюз) и превью картинки.
// Поведение — extension-upload.ts theme-base; скрипту секции нельзя fetch, FormData и blob:, поэтому всё здесь.
// В превью конструктора файлов нет: данных магазина и покупательницы там нет.

const AUTHOR = 'ctx.files.upload';
const NAME_MAX = 255;

const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  heic: 'image/heic',
  heif: 'image/heic',
  webp: 'image/webp',
  gif: 'image/gif',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  pdf: 'application/pdf',
  zip: 'application/zip',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};
const PREVIEW_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const START_REJECTS: Readonly<Record<string, 'format' | 'size'>> = {
  too_large: 'size',
  mime_not_allowed: 'format',
  invalid_kind: 'format',
};
const VERDICT_REJECTS: Readonly<Record<string, 'format' | 'size'>> = { too_large: 'size', wrong_type: 'format' };

interface FilesState {
  readonly core: CoreHandle;
  readonly mode: CoreHandle['mode'];
  readonly page: KeyValue;
  readonly chosen: Map<string, File>;
  readonly links: Map<string, string>;
  readonly images: Map<string, HTMLImageElement>;
  counter: number;
}

// Ответ шага 1: куда и с какими полями отправлять файл.
interface UploadTicket {
  readonly fileId: string;
  readonly url: string;
  readonly fields: Readonly<Record<string, string>>;
}

// Итог шага: отказ (failure), вердикт расширения (rejected) или продолжение.
type OpenReply =
  | { readonly ticket: UploadTicket }
  | { readonly rejected: Result<UploadDone> }
  | { readonly failure: Failure };
type VerdictReply =
  | { readonly ready: true }
  | { readonly rejected: Result<UploadDone> }
  | { readonly failure: Failure };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const textOf = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

// Данные успешного ответа шлюза: success и 2xx.
function dataOf(reply: Reply): Record<string, unknown> | null {
  if (reply.status < 200 || reply.status > 299) return null;
  const body = isRecord(reply.body) ? reply.body : null;
  return body !== null && body.success === true && isRecord(body.data) ? body.data : null;
}

// Тип файла — по расширению имени строчными, иначе тип браузера (тема-base так определяет mime).
function typeOf(file: File): string {
  const dot = file.name.lastIndexOf('.');
  if (dot === -1) return file.type;
  const ext = file.name.slice(dot + 1).toLowerCase();
  return Object.hasOwn(MIME_BY_EXTENSION, ext) ? MIME_BY_EXTENSION[ext] : file.type;
}

const isImage = (file: File): boolean => PREVIEW_TYPES.includes(typeOf(file));

const fileInputOf = (input: El): HTMLInputElement | null => {
  const node = elementOf(input);
  return node instanceof HTMLInputElement && node.type === 'file' ? node : null;
};

// Выбор из поля: файлы получают ключи f1, f2, … и запоминаются до forget; поле очищается.
function chosenFileOf(state: FilesState, file: File): ChosenFile {
  state.counter += 1;
  const key = `f${state.counter}`;
  state.chosen.set(key, file);
  const type = typeOf(file);
  return Object.freeze({ key, name: file.name, size: file.size, type, image: PREVIEW_TYPES.includes(type) });
}

function chosenFiles(state: FilesState, input: El): readonly ChosenFile[] {
  if (state.mode === 'preview') return [];
  const node = fileInputOf(input);
  if (node === null) return [];
  const files = [...(node.files ?? [])];
  node.value = '';
  return Object.freeze(files.map((file) => chosenFileOf(state, file)));
}

function rejectedResult(reason: 'format' | 'size'): Result<UploadDone> {
  return { ok: true, data: { status: 'rejected', reason } };
}

function finish(core: CoreHandle, failure: Failure, options?: ActionOptions): Result<UploadDone> {
  reportFailure(core, failure, options);
  return failed(failure);
}

function reportInvalid(state: FilesState, options?: ActionOptions): Result<UploadDone> {
  return finish(state.core, failureOf('invalid', AUTHOR), options);
}

// Шаг 1: шлюз открывает загрузку; код тела из START_REJECTS — вердикт расширения, не сбой.
async function openTicket(state: FilesState, args: UploadArgs, file: File): Promise<OpenReply> {
  const config = state.core.config;
  if (config === null) return { failure: failureOf('invalid', AUTHOR) };
  const token = tokenOf(state.page);
  const body = {
    kind: args.kind,
    name: file.name.slice(0, NAME_MAX) || args.kind,
    size: file.size,
    mime: typeOf(file),
  };
  const path = `/store/extensions/${encodeURIComponent(args.extension)}/files`;
  const url = `${config.api.url}${path}?store_id=${encodeURIComponent(config.shop.id)}`;
  const reply = await requestJson(url, token === null ? { method: 'POST', body } : { method: 'POST', body, token });
  const reason = START_REJECTS[serverCodeOf(reply) ?? ''];
  if (reason !== undefined) return { rejected: rejectedResult(reason) };
  const ticket = ticketOf(reply);
  return ticket === null ? { failure: failureOf(reasonOf(reply), AUTHOR, reply) } : { ticket };
}

// Поля формы хранилища — все строки.
const stringsRecord = (value: unknown): value is Record<string, string> =>
  isRecord(value) && Object.values(value).every((one) => typeof one === 'string');

function ticketOf(reply: Reply): UploadTicket | null {
  const data = dataOf(reply);
  if (data === null) return null;
  const upload = isRecord(data.upload) ? data.upload : null;
  const fileId = textOf(data.fileId);
  const url = upload === null ? null : textOf(upload.url);
  const fields = upload === null ? undefined : upload.fields;
  if (fileId === null || url === null || !stringsRecord(fields)) return null;
  return { fileId, url, fields };
}

// Шаг 2: файл уходит в хранилище формой — поля по порядку, файл последним, без cookie и токена.
async function sendToStore(
  url: string,
  fields: Readonly<Record<string, string>>,
  file: File,
): Promise<'network' | 'server' | null> {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.append(name, value);
  form.append('file', file);
  try {
    const response = await fetch(url, { method: 'POST', body: form, credentials: 'omit' });
    return response.ok ? null : 'server';
  } catch {
    return 'network'; // хранилище недоступно: шаг 3 не идёт, файл у расширения не появился
  }
}

// Шаг 3: шлюз проверяет файл; вердикт расширения — ready или rejected.
async function completeUpload(state: FilesState, extension: string, fileId: string): Promise<VerdictReply> {
  const config = state.core.config;
  if (config === null) return { failure: failureOf('invalid', AUTHOR) };
  const token = tokenOf(state.page);
  const path = `/store/extensions/${encodeURIComponent(extension)}/files/${encodeURIComponent(fileId)}/complete`;
  const url = `${config.api.url}${path}?store_id=${encodeURIComponent(config.shop.id)}`;
  const reply = await requestJson(
    url,
    token === null ? { method: 'POST', body: {} } : { method: 'POST', body: {}, token },
  );
  return verdictOf(reply, fileId);
}

function verdictOf(reply: Reply, fileId: string): VerdictReply {
  const data = dataOf(reply);
  if (data === null) return { failure: failureOf(reasonOf(reply), AUTHOR, reply) };
  if (data.status === 'rejected') {
    return { rejected: rejectedResult(VERDICT_REJECTS[textOf(data.reason) ?? ''] ?? 'format') };
  }
  if (data.status === 'ready' && data.fileId === fileId) return { ready: true };
  return { failure: failureOf(reasonOf(reply), AUTHOR, reply) };
}

async function uploadFile(
  state: FilesState,
  args: UploadArgs,
  file: File,
  options: ActionOptions | undefined,
): Promise<Result<UploadDone>> {
  const opened = await openTicket(state, args, file);
  if ('failure' in opened) return finish(state.core, opened.failure, options);
  if ('rejected' in opened) return opened.rejected;
  const stored = await sendToStore(opened.ticket.url, opened.ticket.fields, file);
  if (stored !== null) return finish(state.core, failureOf(stored, AUTHOR), options);
  const verdict = await completeUpload(state, args.extension, opened.ticket.fileId);
  if ('failure' in verdict) return finish(state.core, verdict.failure, options);
  if ('rejected' in verdict) return verdict.rejected;
  return { ok: true, data: { status: 'ready', fileId: opened.ticket.fileId } };
}

async function upload(state: FilesState, args: UploadArgs, options?: ActionOptions): Promise<Result<UploadDone>> {
  const file = state.mode === 'preview' ? undefined : state.chosen.get(args.key);
  if (file === undefined || state.core.config === null) return reportInvalid(state, options);
  return uploadFile(state, args, file, options);
}

// Превью: blob-ссылка один раз на ключ; forget отменяет ссылку и скрывает картинку.
function previewImage(state: FilesState, img: El, key: string): void {
  if (state.mode === 'preview') return;
  const node = elementOf(img);
  if (!(node instanceof HTMLImageElement)) return;
  const file = state.chosen.get(key);
  if (file === undefined || !isImage(file)) return;
  const link = state.links.get(key) ?? URL.createObjectURL(file);
  state.links.set(key, link);
  node.setAttribute('src', link);
  node.hidden = false;
  state.images.set(key, node);
}

function forgetFile(state: FilesState, key: string): void {
  const link = state.links.get(key);
  if (link !== undefined) URL.revokeObjectURL(link);
  const img = state.images.get(key);
  if (img !== undefined) {
    img.removeAttribute('src');
    img.hidden = true;
  }
  state.chosen.delete(key);
  state.links.delete(key);
  state.images.delete(key);
}

export const files: SdkPart<'files', FilesModule> = {
  name: 'files',
  create(core: CoreHandle): FilesModule {
    const state: FilesState = {
      core,
      mode: core.mode,
      page: pageStorage(window, core.mode),
      chosen: new Map(),
      links: new Map(),
      images: new Map(),
      counter: 0,
    };
    return Object.freeze({
      chosen: (input: El): readonly ChosenFile[] => chosenFiles(state, input),
      upload: (args: UploadArgs, options?: ActionOptions): Promise<Result<UploadDone>> => upload(state, args, options),
      preview: (img: El, key: string): void => previewImage(state, img, key),
      forget: (key: string): void => forgetFile(state, key),
    });
  },
};

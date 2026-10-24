/**
 * extension-purchase — форма расширения вместо кнопки покупки на странице
 * товара сайта магазина.
 *
 * ЧТО ЭТО. Расширение может сказать витрине: «этот товар продаётся через мою
 * форму» (точка `product` в карте `GET /store/extensions/storefront`). Тогда
 * вместо «В корзину» покупатель видит форму расширения: пункты, контакты,
 * согласие, кнопку. Весь текст формы и экрана ответа приходит от расширения;
 * здесь только общие слова формы («обязательно», «Выберите», подсказки
 * контактов) и общий текст сбоя. Слов предметной области в файле нет:
 * такую форму мог бы написать любой пользователь платформы (решение Р8).
 *
 * ПОЧЕМУ БАНДЛ, А НЕ `.toString()` (как в `extension-points.ts`). Модуль
 * тянет проверку формы из копии пакета форм (`forms-vendor/`) — это десяток
 * функций с общими данными, склеивать их строками нельзя. Поэтому скрипт
 * `scripts/build-purchase-runtime.mjs` собирает модуль esbuild-ом в одну
 * самодостаточную строку (`extension-purchase.runtime.ts`), а сторож-тест
 * следит, что строка не отстала от этого файла. Блоки тем хёдрируются только
 * через `<script is:inline set:html>`: обычный `import` на собранной витрине
 * даёт 404 (см. комментарий в `extension-points.ts`).
 *
 * ЛОГИКА ОТДЕЛЬНО ОТ DOM (RULES §3.8). Раскладка, сбор ответа, безопасная
 * ссылка, разбор ответа и разметка — чистые функции «вход → строка/данные»;
 * DOM, события и сеть — тонкий слой внизу (`mountExtensionPurchase`).
 *
 * ТИШИНА. Нет точки, форма `null`, сеть или ошибка на этапе показа — не
 * рисуем ничего: кнопка покупки остаётся, как будто фичи нет.
 *
 * ФАЙЛЫ (задача 5.2). Файл грузится сразу после выбора, в три шага
 * (`extension-upload.ts`); в отправку уходят id готовых файлов. Перед
 * отправкой форма ждёт идущие загрузки и один раз повторяет неудачные;
 * готовые файлы при повторе отправки заново не грузятся. Состояние и
 * разметка файлов — `extension-purchase-files.ts`.
 */
import type {
  ContactItem,
  ContactKey,
  FieldItem,
  FormItem,
  FormV2,
} from "./forms-vendor/types-v2";
import { CONTACT_KEYS } from "./forms-vendor/types-v2";
import type { FieldType } from "./forms-vendor/types";
import {
  hasErrors,
  MESSAGES_V2,
  validateV2,
  visibleItems,
  type ContactValuesV2,
  type ValidationErrorsV2,
} from "./forms-vendor/validate-v2";
import {
  attribute,
  callFunction,
  escapeHtml,
  fetchAccountEmail,
  fetchStorefrontMap,
  isRecord,
  isSuccessStatus,
  safeLink,
} from "./extension-call";
import {
  canPreview,
  uploadFile,
  type UploadOutcome,
  type UploadType,
} from "./extension-upload";
import {
  applyOutcome,
  entriesOf,
  FILE_TEXTS,
  fileCounts,
  findEntry,
  pendingUploads,
  pickFiles,
  readyFileIds,
  uploadControlHtml,
  uploadFieldOf,
  type FileEntries,
  type UploadEntry,
} from "./extension-purchase-files";

export { safeLink };
export { uploadHint } from "./extension-purchase-files";

/* ── Типы: копии SDK 2.9 (ProductFormView, ProductSubmitInput, ProductSubmitResult) ── */

export interface ProductFormView {
  title: string;
  submitLabel: string;
  hint?: string;
  priceNote?: string;
  form: FormV2;
}

export type ProductSubmitValue = string | number | boolean | null;

export interface ProductSubmitInput {
  /** Ключ повтора: один на показ формы, уходит в каждой отправке (SDK 0.16.0). */
  submitId: string;
  productId: string;
  values: Record<string, ProductSubmitValue>;
  contacts: ContactValuesV2;
  files: Record<string, string[]>;
}

export interface ProductSubmitButton {
  label: string;
  url: string;
}

export interface ProductSubmitResult {
  title: string;
  text?: string;
  buttons?: ProductSubmitButton[];
}

export interface PurchasePoint {
  extensionId: string;
  form: string;
  submit: string;
}

export interface MountExtensionPurchaseOptions {
  productId: string;
  storeId: string;
  apiBase: string;
}

/** Всё, что меняется на экране формы; рисует его `renderFormHtml`. */
export interface FormState {
  values: Record<string, unknown>;
  contacts: ContactValuesV2;
  errors: ValidationErrorsV2;
  /** Текст у кнопки: отказ расширения или общий сбой. */
  notice: string;
  busy: boolean;
  /** uuid v4, создаётся один раз при показе формы: повтор после сбоя несёт тот же ключ. */
  submitId: string;
  /** Выбранные файлы по id пункта: загружаются сразу, в отправку — id готовых. */
  files: FileEntries;
  /**
   * Почта аккаунта вошедшего покупателя. Не пустая — поле «Почта» заполнено ею и
   * только для чтения, в отправку уходит она. Пусто или нет — гость, вводит сам.
   */
  accountEmail?: string;
}

/** Всё, что нужно от `crypto` для ключа повтора; в тестах подменяется. */
export interface RandomSource {
  randomUUID?: () => string;
  getRandomValues?: (bytes: Uint8Array) => Uint8Array;
}

export type SubmitOutcome =
  | { kind: "success"; result: ProductSubmitResult }
  | { kind: "refused"; message: string; fields: string[] }
  | { kind: "invalid"; fields: string[] }
  | { kind: "failed" };

/* ── Константы: тексты, селекторы, лимиты ── */

const TEXTS = {
  required: "обязательно",
  optional: "необязательно",
  choose: "Выберите",
  consent: "Даю согласие на обработку персональных данных и файлов",
  phoneShort: "Проверьте номер: нужно не меньше 10 цифр",
  failure: "Не удалось отправить. Попробуйте ещё раз.",
  filesFailure: "Не все файлы загрузились — проверьте отмеченные поля.",
} as const;

const CONTACT_INPUTS: Record<
  ContactKey,
  { type: string; placeholder: string }
> = {
  name: { type: "text", placeholder: "" },
  email: { type: "email", placeholder: "name@mail.ru" },
  phone: { type: "tel", placeholder: "+7" },
  social: { type: "text", placeholder: "@ник или ссылка на профиль" },
};

const CONTAINER_SELECTOR = "[data-extension-purchase]";
const ACTIONS_SELECTOR = "[data-product-actions]";
/** Переключатель количества «− 1 +»: у формы своего количества нет — прячется вместе с кнопками. */
const QUANTITY_SELECTOR = "[data-product-quantity]";
const NOTE_SELECTOR = "[data-extension-purchase-note]";
const MOUNTED_ATTRIBUTE = "data-extension-purchase-mounted";
const MAX_RESULT_BUTTONS = 3;

/* ── Мелкие общие помощники (канал к шлюзу и экранирование — extension-call.ts) ── */

const hasOwn = (object: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(object, key);

const isOptionalString = (value: unknown): boolean =>
  value === undefined || typeof value === "string";

/** Программное имя поля: подпись над ним — не `<label>`, а у поля нет другого имени. */
const ariaLabel = (title: string): string => attribute("aria-label", title);

const textOf = (value: unknown): string => {
  if (typeof value === "string") return value;
  return typeof value === "number" ? String(value) : "";
};

/* ── Точка расширения из карты ── */

function pointOf(extensionId: string, entry: unknown): PurchasePoint | null {
  const product = isRecord(entry) ? entry.product : undefined;
  if (!isRecord(product)) return null;
  const { form, submit } = product;
  const named =
    typeof form === "string" &&
    form !== "" &&
    typeof submit === "string" &&
    submit !== "";
  return named ? { extensionId, form, submit } : null;
}

/** Первое расширение карты, у которого точка `product` называет функции формы и отправки. */
export function findProductPoint(map: unknown): PurchasePoint | null {
  if (!isRecord(map)) return null;
  const points = Object.entries(map).map(([id, entry]) => pointOf(id, entry));
  return points.find((point) => point !== null) ?? null;
}

/* ── Проверка ответа расширения (внешние данные — unknown, сразу сужаем) ── */

const ITEM_SHAPES = new Map<string, (item: Record<string, unknown>) => boolean>(
  [
    [
      "field",
      (item) =>
        typeof item.type === "string" && hasOwn(FIELD_RENDERERS, item.type),
    ],
    ["contact", (item) => CONTACT_KEYS.some((key) => key === item.key)],
  ],
);

function isFormItem(value: unknown): value is FormItem {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.title !== "string"
  )
    return false;
  if (typeof value.visible !== "boolean" || typeof value.required !== "boolean")
    return false;
  const shapeOk =
    typeof value.kind === "string" ? ITEM_SHAPES.get(value.kind) : undefined;
  return shapeOk !== undefined && shapeOk(value);
}

function isFormView(value: unknown): value is ProductFormView {
  if (!isRecord(value) || !isRecord(value.form)) return false;
  const named =
    typeof value.title === "string" && typeof value.submitLabel === "string";
  const noted =
    isOptionalString(value.hint) && isOptionalString(value.priceNote);
  const { items, version } = value.form;
  return (
    named &&
    noted &&
    version === 2 &&
    Array.isArray(items) &&
    items.every(isFormItem)
  );
}

function isSubmitResult(value: unknown): value is ProductSubmitResult {
  return isRecord(value) && typeof value.title === "string";
}

/* ── Раскладка и сбор ответа ── */

const isNumberItem = (item: FormItem): boolean =>
  item.kind === "field" && item.type === "number";

/** Пункты по порядку; два числовых подряд — в одну строку (как в прототипе PM). */
export function layoutRows(items: readonly FormItem[]): FormItem[][] {
  const rows: FormItem[][] = [];
  for (let index = 0; index < items.length; index += 1) {
    const pair = items.slice(index, index + 2);
    const paired = pair.length === 2 && pair.every(isNumberItem);
    rows.push(paired ? pair : [items[index]]);
    index += paired ? 1 : 0;
  }
  return rows;
}

const trimmedText = (raw: unknown): ProductSubmitValue => {
  const text = textOf(raw).trim();
  return text === "" ? null : text;
};

const numberValue = (raw: unknown): ProductSubmitValue => {
  const text = textOf(raw).trim();
  const parsed = text === "" ? Number.NaN : Number(text);
  return Number.isFinite(parsed) ? parsed : null;
};

/** Как значение пункта уходит в ответ; `null` — файловые пункты, их значение живёт в `files`. */
const SUBMIT_VALUE_BY_TYPE: Record<
  FieldType,
  ((raw: unknown) => ProductSubmitValue) | null
> = {
  text: trimmedText,
  textarea: trimmedText,
  select: trimmedText,
  buttons: trimmedText,
  date: trimmedText,
  number: numberValue,
  checkbox: (raw) => raw === true,
  photo: null,
  video: null,
  file: null,
};

const UUID_BYTES = 16;
const BYTE_VALUES = 256;

/** Случайные байты: `getRandomValues`, а без него — `Math.random` (последняя опора для старых браузеров). */
function fillRandom(bytes: Uint8Array, source: RandomSource | undefined): void {
  if (source?.getRandomValues) {
    source.getRandomValues(bytes);
    return;
  }
  bytes.forEach((_, index) => {
    bytes[index] = Math.floor(Math.random() * BYTE_VALUES);
  });
}

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

/** uuid v4: `crypto.randomUUID`, а если его нет — из случайных байт с битами версии и варианта. */
export function createSubmitId(source: RandomSource | undefined): string {
  if (typeof source?.randomUUID === "function") return source.randomUUID();
  const bytes = new Uint8Array(UUID_BYTES);
  fillRandom(bytes, source);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = toHex(bytes);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

/**
 * Тело отправки: только видимые пункты; согласие всегда `true` (без него форма
 * не уходит). `fileIds` — id готовых файлов по пунктам: в `files` попадают
 * только видимые файловые пункты, у которых есть файлы.
 */
export function collectSubmitInput(
  productId: string,
  form: FormV2,
  state: Pick<FormState, "values" | "contacts" | "submitId" | "accountEmail">,
  fileIds: Record<string, string[]> = {},
): ProductSubmitInput {
  const shown = visibleItems(form, state.values);
  const values: Record<string, ProductSubmitValue> = {};
  const contacts: ContactValuesV2 = {};
  const files: Record<string, string[]> = {};
  for (const item of shown) {
    if (item.kind === "contact") {
      const typed = textOf(state.contacts[item.key]).trim();
      // Вошедший покупатель: почта аккаунта, что бы ни лежало в поле.
      const text =
        item.key === "email" && state.accountEmail
          ? state.accountEmail
          : typed;
      if (text !== "") contacts[item.key] = text;
      continue;
    }
    const read = SUBMIT_VALUE_BY_TYPE[item.type];
    if (read !== null) values[item.id] = read(state.values[item.id]);
    const ids = hasOwn(fileIds, item.id) ? fileIds[item.id] : [];
    if (read === null && ids.length > 0) files[item.id] = [...ids];
  }
  return {
    submitId: state.submitId,
    productId,
    values,
    contacts: { ...contacts, consent: true },
    files,
  };
}

/* ── Разбор ответа отправки ── */

const FAILED: SubmitOutcome = { kind: "failed" };

function fieldsOf(body: unknown): string[] {
  const issues = isRecord(body) ? body.issues : undefined;
  const fields = isRecord(issues) ? issues.fields : undefined;
  return Array.isArray(fields)
    ? fields.filter((id): id is string => typeof id === "string")
    : [];
}

function successOutcome(body: unknown): SubmitOutcome {
  if (!isRecord(body) || body.success !== true || !isSubmitResult(body.data))
    return FAILED;
  return { kind: "success", result: body.data };
}

function refusedOutcome(body: unknown): SubmitOutcome {
  if (!isRecord(body) || body.code !== "refused") return FAILED;
  const { message } = body;
  if (typeof message !== "string" || message === "") return FAILED;
  return { kind: "refused", message, fields: fieldsOf(body) };
}

const invalidOutcome = (body: unknown): SubmitOutcome => ({
  kind: "invalid",
  fields: fieldsOf(body),
});

const OUTCOME_BY_STATUS = new Map<number, (body: unknown) => SubmitOutcome>([
  [400, invalidOutcome],
  [422, refusedOutcome],
]);

/** Что значит ответ функции отправки; незнакомый статус — общий сбой. */
export function classifyResponse(status: number, body: unknown): SubmitOutcome {
  const read = isSuccessStatus(status)
    ? successOutcome
    : OUTCOME_BY_STATUS.get(status);
  return read === undefined ? FAILED : read(body);
}

/* ── Разметка (строки; всё от расширения экранируется) ── */

interface FieldView {
  field: FieldItem;
  value: unknown;
  error: string | undefined;
  bad: boolean;
  /** Выбранные файлы пункта; у нефайловых — пусто. */
  entries: UploadEntry[];
}

const inputClass = (view: FieldView): string =>
  view.bad ? "sf-in bad" : "sf-in";
const errorHtml = (text: string | undefined): string =>
  text ? `<div class="err">${escapeHtml(text)}</div>` : "";

function labelHtml(title: string, required: boolean): string {
  const mark = required ? TEXTS.required : TEXTS.optional;
  return `<div class="sf-l"><span>${escapeHtml(title)}</span><small>${mark}</small></div>`;
}

const fieldHtml = (view: FieldView, control: string): string =>
  `<div class="sf-f">${labelHtml(view.field.title, view.field.required)}${control}${errorHtml(view.error)}</div>`;

function inputHtml(view: FieldView, type: string, extra = ""): string {
  const id = attribute("data-xp-field", view.field.id);
  return `<input class="${inputClass(view)}" type="${type}"${extra}${id}${ariaLabel(view.field.title)}${attribute("value", textOf(view.value))}>`;
}

function selectHtml(view: FieldView): string {
  const choices = (view.field.options ?? []).map(
    (option) =>
      `<option value="${escapeHtml(option)}"${option === view.value ? " selected" : ""}>${escapeHtml(option)}</option>`,
  );
  const head = `<option value="">${TEXTS.choose}</option>`;
  return `<select class="${inputClass(view)}"${attribute("data-xp-field", view.field.id)}${ariaLabel(view.field.title)}>${head}${choices.join("")}</select>`;
}

function segmentsHtml(view: FieldView): string {
  const buttons = (view.field.options ?? []).map((option) => {
    const on = option === view.value ? ' class="on"' : "";
    const data =
      attribute("data-xp-field", view.field.id) +
      attribute("data-xp-value", option);
    return `<button type="button"${on}${data}>${escapeHtml(option)}</button>`;
  });
  return `<div class="sf-seg">${buttons.join("")}</div>`;
}

function checkboxHtml(view: FieldView): string {
  const checked = view.value === true ? " checked" : "";
  const box = `<input type="checkbox"${attribute("data-xp-field", view.field.id)}${checked}>`;
  return `<label class="sf-cb">${box}<span>${escapeHtml(view.field.title)}</span></label>${errorHtml(view.error)}`;
}

/**
 * Файловый пункт: плитка выбора и выбранные файлы. Метка `data-xp-upload`
 * нужна, чтобы перерисовать один пункт, когда файл загрузился: перерисовка
 * всей формы сбила бы фокус с поля, где покупатель пишет.
 */
function uploadHtml(type: UploadType) {
  return (view: FieldView): string => {
    const field = { ...view.field, type };
    const label = labelHtml(field.title, field.required);
    const control = uploadControlHtml(field, view.entries, view.bad);
    return `<div class="sf-f"${attribute("data-xp-upload", field.id)}>${label}${control}${errorHtml(view.error)}</div>`;
  };
}

type FieldRenderer = (view: FieldView) => string;

const FIELD_RENDERERS: Record<FieldType, FieldRenderer> = {
  text: (view) => fieldHtml(view, inputHtml(view, "text")),
  textarea: (view) =>
    fieldHtml(
      view,
      `<textarea class="${inputClass(view)}"${attribute("data-xp-field", view.field.id)}${ariaLabel(view.field.title)}>${escapeHtml(textOf(view.value))}</textarea>`,
    ),
  number: (view) =>
    fieldHtml(view, inputHtml(view, "number", ' inputmode="decimal"')),
  date: (view) => fieldHtml(view, inputHtml(view, "date")),
  select: (view) => fieldHtml(view, selectHtml(view)),
  buttons: (view) => fieldHtml(view, segmentsHtml(view)),
  checkbox: checkboxHtml,
  photo: uploadHtml("photo"),
  video: uploadHtml("video"),
  file: uploadHtml("file"),
};

/**
 * Имя поля контакта: название и пример из подсказки («Почта: name@mail.ru»).
 * `aria-label` заслоняет `placeholder` в доступном имени, а сверка с эталоном
 * и читалка экрана находят поле по подсказке — поэтому она остаётся в имени.
 */
const contactName = (title: string, placeholder: string): string =>
  placeholder === "" ? title : `${title}: ${placeholder}`;

function contactHtml(item: ContactItem, state: FormState): string {
  const input = CONTACT_INPUTS[item.key];
  const error = state.errors.items[item.id];
  const bad = hasOwn(state.errors.items, item.id);
  const placeholder =
    input.placeholder === "" ? "" : attribute("placeholder", input.placeholder);
  // Вошедшему покупателю почту ставит аккаунт, менять её нельзя.
  const locked = item.key === "email" && Boolean(state.accountEmail);
  const readonly = locked ? " readonly" : "";
  const control =
    `<input class="${bad ? "sf-in bad" : "sf-in"}" type="${input.type}"` +
    `${attribute("data-xp-contact", item.key)}${ariaLabel(contactName(item.title, input.placeholder))}${attribute("value", textOf(state.contacts[item.key]))}${placeholder}${readonly} autocomplete="off">`;
  return `<div class="sf-f">${labelHtml(item.title, item.required)}${control}${errorHtml(error)}</div>`;
}

function itemHtml(item: FormItem, state: FormState): string {
  if (item.kind === "contact") return contactHtml(item, state);
  const view: FieldView = {
    field: item,
    value: state.values[item.id],
    error: state.errors.items[item.id],
    bad: hasOwn(state.errors.items, item.id),
    entries: entriesOf(state.files, item.id),
  };
  return FIELD_RENDERERS[item.type](view);
}

function rowHtml(row: FormItem[], state: FormState): string {
  const cells = row.map((item) => itemHtml(item, state)).join("");
  return row.length === 2 ? `<div class="sf-num">${cells}</div>` : cells;
}

function consentHtml(state: FormState): string {
  const checked = state.contacts.consent === true ? " checked" : "";
  const box = `<input type="checkbox" data-xp-consent${checked}>`;
  return `<label class="sf-cb">${box}<span>${TEXTS.consent}</span></label>${errorHtml(state.errors.consent)}`;
}

/** Вся форма: заголовок, пункты по порядку, согласие, кнопка, текст у кнопки, подсказка. */
export function renderFormHtml(
  view: ProductFormView,
  state: FormState,
): string {
  const rows = layoutRows(visibleItems(view.form, state.values));
  const button = `<button type="button" class="sf-btn" data-xp-submit${state.busy ? " disabled" : ""}>${escapeHtml(view.submitLabel)}</button>`;
  const hint = view.hint
    ? `<div class="sf-note">${escapeHtml(view.hint)}</div>`
    : "";
  return [
    `<div class="sf-h"><b>${escapeHtml(view.title)}</b></div>`,
    ...rows.map((row) => rowHtml(row, state)),
    consentHtml(state),
    button,
    errorHtml(state.notice),
    hint,
  ].join("");
}

const isShownButton = (button: unknown): button is ProductSubmitButton =>
  isRecord(button) &&
  typeof button.label === "string" &&
  safeLink(button.url) !== null;

/** Экран ответа: заголовок, текст, до трёх кнопок-ссылок (первая тёмная, остальные светлые). */
export function renderResultHtml(result: ProductSubmitResult): string {
  const links = (result.buttons ?? [])
    .filter(isShownButton)
    .slice(0, MAX_RESULT_BUTTONS);
  const anchors = links.map((link, index) => {
    const look = index === 0 ? "sf-btn" : "sf-btn light";
    return `<a class="${look}"${attribute("href", link.url)}>${escapeHtml(link.label)}</a>`;
  });
  const text = result.text ? `<span>${escapeHtml(result.text)}</span>` : "";
  return `<div class="okbox"><b>${escapeHtml(result.title)}</b>${text}</div>${anchors.join("")}`;
}

/* ── DOM: показ формы и события ── */

function scrollToFirstProblem(container: HTMLElement): void {
  const target = container.querySelector(".bad, .err");
  if (target !== null && typeof target.scrollIntoView === "function") {
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

/** hidden и display:none: у кнопок тем есть flex-классы, они перебивают [hidden]. */
function hideElement(element: HTMLElement): void {
  element.hidden = true;
  element.style.display = "none";
}

function revealForm(
  root: ParentNode,
  container: HTMLElement,
  view: ProductFormView,
): void {
  const replaced = root.querySelectorAll<HTMLElement>(
    `${ACTIONS_SELECTOR}, ${QUANTITY_SELECTOR}`,
  );
  replaced.forEach(hideElement);
  const note = root.querySelector<HTMLElement>(NOTE_SELECTOR);
  if (note !== null && view.priceNote) {
    note.textContent = view.priceNote;
    note.hidden = false;
  }
  container.hidden = false;
}

const isConditionSource = (form: FormV2, id: string): boolean =>
  form.items.some(
    (item) => item.kind === "field" && item.condition?.field === id,
  );

type FormControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

const isFormControl = (target: EventTarget | null): target is FormControl =>
  target instanceof HTMLInputElement ||
  target instanceof HTMLSelectElement ||
  target instanceof HTMLTextAreaElement;

const controlValue = (control: FormControl): string | boolean =>
  control instanceof HTMLInputElement && control.type === "checkbox"
    ? control.checked
    : control.value;

interface Session {
  container: HTMLElement;
  view: ProductFormView;
  point: PurchasePoint;
  options: MountExtensionPurchaseOptions;
  state: FormState;
  /** Сколько файлов выбрано за показ формы: из него — номер записи файла. */
  uploads: number;
}

const paint = (session: Session): void => {
  session.container.innerHTML = renderFormHtml(session.view, session.state);
};

/** Перерисовать один файловый пункт, не трогая остальную форму. */
function repaintUpload(session: Session, itemId: string): void {
  const nodes =
    session.container.querySelectorAll<HTMLElement>("[data-xp-upload]");
  const node = Array.from(nodes).find((one) => one.dataset.xpUpload === itemId);
  const item = session.view.form.items.find((one) => one.id === itemId);
  if (node === undefined || item === undefined) return;
  node.outerHTML = itemHtml(item, session.state);
}

/** Текст у пункта: пустой убирает прежний. */
function setProblem(state: FormState, itemId: string, text: string): void {
  const items = { ...state.errors.items };
  delete items[itemId];
  state.errors.items = text === "" ? items : { ...items, [itemId]: text };
}

/** Пишет введённое в состояние; возвращает id пункта, если от него зависят условия показа. */
function writeControl(session: Session, control: FormControl): string | null {
  const { xpField, xpContact, xpConsent } = control.dataset;
  const value = controlValue(control);
  if (xpConsent !== undefined) session.state.contacts.consent = value === true;
  const contactKey = CONTACT_KEYS.find((key) => key === xpContact);
  if (contactKey !== undefined)
    session.state.contacts[contactKey] = textOf(value);
  if (xpField === undefined) return null;
  session.state.values[xpField] = value;
  return isConditionSource(session.view.form, xpField) ? xpField : null;
}

function onInput(session: Session, event: Event): void {
  if (isFormControl(event.target)) writeControl(session, event.target);
}

function onChange(session: Session, event: Event): void {
  const { target } = event;
  const fileInput =
    target instanceof HTMLInputElement && target.dataset.xpFile !== undefined;
  if (fileInput) {
    chooseFiles(session, target);
    return;
  }
  if (!isFormControl(target)) return;
  if (writeControl(session, target) !== null) paint(session);
}

function chooseSegment(session: Session, button: HTMLElement): void {
  const { xpField, xpValue } = button.dataset;
  if (xpField === undefined || xpValue === undefined) return;
  session.state.values[xpField] = xpValue;
  paint(session);
}

/* ── Файлы: выбор, загрузка, «убрать» ── */

const FAILED_UPLOAD: UploadOutcome = { kind: "failed" };

/** Превью — только для форматов, которые браузер покажет (HEIC — без превью). */
const previewOf = (file: File): string =>
  canPreview(file) && typeof URL.createObjectURL === "function"
    ? URL.createObjectURL(file)
    : "";

function releasePreview(entry: UploadEntry): void {
  if (entry.preview === "" || typeof URL.revokeObjectURL !== "function") return;
  URL.revokeObjectURL(entry.preview);
}

function newEntry(session: Session, type: UploadType, file: File): UploadEntry {
  session.uploads += 1;
  return {
    key: String(session.uploads),
    type,
    file,
    status: "loading",
    fileId: "",
    preview: previewOf(file),
    job: Promise.resolve(),
  };
}

function dropEntry(
  session: Session,
  itemId: string,
  entry: UploadEntry,
  problem: string,
): void {
  const entries = entriesOf(session.state.files, itemId);
  session.state.files[itemId] = entries.filter((one) => one !== entry);
  releasePreview(entry);
  setProblem(session.state, itemId, problem);
}

/** Итог загрузки; файл убрали, пока он грузился, — итог не нужен. */
function settleUpload(
  session: Session,
  itemId: string,
  entry: UploadEntry,
  outcome: UploadOutcome,
): void {
  if (!entriesOf(session.state.files, itemId).includes(entry)) return;
  const problem = applyOutcome(entry, outcome);
  if (problem !== "") dropEntry(session, itemId, entry, problem);
  repaintUpload(session, itemId);
}

function startUpload(
  session: Session,
  itemId: string,
  entry: UploadEntry,
): void {
  const { options, point } = session;
  entry.status = "loading";
  entry.job = uploadFile(options, point.extensionId, entry.type, entry.file)
    .catch(() => FAILED_UPLOAD)
    .then((outcome) => settleUpload(session, itemId, entry, outcome));
}

/** Выбор файлов: годные встают в пункт и сразу грузятся, причина отказа — у пункта. */
function chooseFiles(session: Session, input: HTMLInputElement): void {
  const field = uploadFieldOf(session.view.form.items, input.dataset.xpFile);
  if (field === null) return;
  const { files } = session.state;
  const picked = pickFiles(field, Array.from(input.files ?? []), files);
  const added = picked.accepted.map((file) =>
    newEntry(session, field.type, file),
  );
  files[field.id] = [...entriesOf(files, field.id), ...added];
  setProblem(session.state, field.id, picked.problem);
  repaintUpload(session, field.id);
  added.forEach((entry) => startUpload(session, field.id, entry));
}

function removeFile(session: Session, key: string): void {
  const placed = findEntry(session.state.files, key);
  if (session.state.busy || placed === null) return;
  dropEntry(session, placed.itemId, placed.entry, "");
  repaintUpload(session, placed.itemId);
}

/** Перед отправкой: ждём идущие загрузки, неудачные повторяем один раз; готовые не трогаем. */
async function finishUploads(session: Session): Promise<boolean> {
  const pending = pendingUploads(session.state.files);
  pending
    .filter(({ entry }) => entry.status === "failed")
    .forEach(({ itemId, entry }) => startUpload(session, itemId, entry));
  await Promise.all(pending.map(({ entry }) => entry.job));
  const left = pendingUploads(session.state.files);
  return left.length === 0 && !hasErrors(session.state.errors);
}

function showUploadProblem(session: Session): void {
  const { state } = session;
  state.busy = false;
  pendingUploads(state.files).forEach(({ itemId }) =>
    setProblem(state, itemId, FILE_TEXTS.notUploaded),
  );
  state.notice = TEXTS.filesFailure;
  paint(session);
  scrollToFirstProblem(session.container);
}

function showResult(session: Session, result: ProductSubmitResult): void {
  session.container.classList.add("done");
  session.container.innerHTML = renderResultHtml(result);
  if (typeof session.container.scrollIntoView === "function") {
    session.container.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function showFailure(session: Session, outcome: SubmitOutcome): void {
  const flagged =
    outcome.kind === "refused" || outcome.kind === "invalid"
      ? outcome.fields
      : [];
  session.state.errors = {
    items: Object.fromEntries(flagged.map((id) => [id, ""])),
  };
  session.state.notice =
    outcome.kind === "refused" ? outcome.message : TEXTS.failure;
  paint(session);
}

/**
 * Пакет форм отвечает на пустой и на неполный телефон одним текстом («Нужен
 * телефон»). Неполный номер — не пустое поле: ему свой текст, пустому — прежний.
 */
function withShortPhoneText(
  form: FormV2,
  contacts: ContactValuesV2,
  errors: ValidationErrorsV2,
): ValidationErrorsV2 {
  if (textOf(contacts.phone).trim() === "") return errors;
  const items = { ...errors.items };
  for (const item of form.items) {
    const flagged =
      item.kind === "contact" &&
      item.key === "phone" &&
      items[item.id] === MESSAGES_V2.phoneRequired;
    if (flagged) items[item.id] = TEXTS.phoneShort;
  }
  return { ...errors, items };
}

/** Проверка формы пакетом форм; файлы считаются все выбранные, даже не догрузившиеся. */
function checkAnswers(session: Session): boolean {
  const { state, view, container } = session;
  const counts = fileCounts(state.files);
  state.errors = withShortPhoneText(
    view.form,
    state.contacts,
    validateV2(view.form, state.values, state.contacts, counts),
  );
  state.notice = "";
  if (!hasErrors(state.errors)) return true;
  paint(session);
  scrollToFirstProblem(container);
  return false;
}

async function submit(session: Session): Promise<void> {
  if (session.state.busy || !checkAnswers(session)) return;
  session.state.busy = true;
  paint(session);
  if (!(await finishUploads(session))) {
    showUploadProblem(session);
    return;
  }
  await send(session);
}

async function send(session: Session): Promise<void> {
  const { state, view, point, options } = session;
  const fileIds = readyFileIds(state.files);
  const input = collectSubmitInput(
    options.productId,
    view.form,
    state,
    fileIds,
  );
  const reply = await callFunction(
    options,
    { extensionId: point.extensionId, name: point.submit },
    input,
  );
  state.busy = false;
  const outcome =
    reply === null ? FAILED : classifyResponse(reply.status, reply.body);
  if (outcome.kind === "success") {
    showResult(session, outcome.result);
    return;
  }
  showFailure(session, outcome);
}

function onClick(session: Session, event: Event): void {
  const target = event.target instanceof Element ? event.target : null;
  const segment = target?.closest<HTMLElement>("[data-xp-value]") ?? null;
  if (segment !== null) chooseSegment(session, segment);
  const remove = target?.closest<HTMLElement>("[data-xp-remove]") ?? null;
  if (remove !== null) removeFile(session, remove.dataset.xpRemove ?? "");
  if (target?.closest("[data-xp-submit]")) void submit(session);
}

async function loadForm(
  options: MountExtensionPurchaseOptions,
): Promise<{ point: PurchasePoint; view: ProductFormView } | null> {
  const point = findProductPoint(await fetchStorefrontMap(options));
  if (point === null) return null;
  const reply = await callFunction(
    options,
    { extensionId: point.extensionId, name: point.form },
    {
      productId: options.productId,
    },
  );
  if (reply === null || !isSuccessStatus(reply.status)) return null;
  const data =
    isRecord(reply.body) && reply.body.success === true
      ? reply.body.data
      : null;
  return isFormView(data) ? { point, view: data } : null;
}

/**
 * Точка входа. `root` — секция «Товар» (из `__merfyRoot`), в ней контейнер
 * `[data-extension-purchase]`. Карта → форма → показ; любой сбой на этом пути —
 * тишина, кнопка покупки остаётся.
 */
export async function mountExtensionPurchase(
  root: ParentNode,
  options: MountExtensionPurchaseOptions,
): Promise<void> {
  const container = root.querySelector<HTMLElement>(CONTAINER_SELECTOR);
  if (container === null || container.hasAttribute(MOUNTED_ATTRIBUTE)) return;
  container.setAttribute(MOUNTED_ATTRIBUTE, "");
  const loaded = await loadForm(options);
  if (loaded === null) return;
  const accountEmail = await fetchAccountEmail(options);
  const state: FormState = {
    values: {},
    contacts: accountEmail === "" ? {} : { email: accountEmail },
    accountEmail,
    errors: { items: {} },
    notice: "",
    busy: false,
    submitId: createSubmitId(
      typeof crypto === "undefined" ? undefined : crypto,
    ),
    files: {},
  };
  const session: Session = {
    container,
    view: loaded.view,
    point: loaded.point,
    options,
    state,
    uploads: 0,
  };
  revealForm(root, container, loaded.view);
  paint(session);
  container.addEventListener("input", (event) => onInput(session, event));
  container.addEventListener("change", (event) => onChange(session, event));
  container.addEventListener("click", (event) => onClick(session, event));
}

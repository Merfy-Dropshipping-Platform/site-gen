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
 */
import { FILE_LIMITS } from "./forms-vendor/file-limits";
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
  validateV2,
  visibleItems,
  type ContactValuesV2,
  type ValidationErrorsV2,
} from "./forms-vendor/validate-v2";

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
  failure: "Не удалось отправить. Попробуйте ещё раз.",
} as const;

type UploadType = "photo" | "video" | "file";

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

const CONTACT_INPUTS: Record<
  ContactKey,
  { type: string; placeholder: string }
> = {
  name: { type: "text", placeholder: "" },
  email: { type: "email", placeholder: "name@mail.ru" },
  phone: { type: "tel", placeholder: "+7" },
  social: { type: "text", placeholder: "@ник или ссылка на профиль" },
};

const CUSTOMER_TOKEN_KEY = "merfy_customer_token";
const CONTAINER_SELECTOR = "[data-extension-purchase]";
const ACTIONS_SELECTOR = "[data-product-actions]";
const NOTE_SELECTOR = "[data-extension-purchase-note]";
const MOUNTED_ATTRIBUTE = "data-extension-purchase-mounted";
const MAX_RESULT_BUTTONS = 3;
/** Пробелы, управляющие символы и обратная косая: браузер при разборе ссылки убирает табуляцию и склеивает `/` + `\t/` в `//`. */
const UNSAFE_LINK_CHARS = /[\s\\\p{Cc}]/u;
const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/* ── Мелкие общие помощники ── */

const hasOwn = (object: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(object, key);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isOptionalString = (value: unknown): boolean =>
  value === undefined || typeof value === "string";

const escapeHtml = (raw: unknown): string =>
  String(raw ?? "").replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);

const attribute = (name: string, value: string): string =>
  ` ${name}="${escapeHtml(value)}"`;

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

/** Тело отправки: только видимые пункты; согласие всегда `true` (без него форма не уходит). */
export function collectSubmitInput(
  productId: string,
  form: FormV2,
  state: Pick<FormState, "values" | "contacts">,
): ProductSubmitInput {
  const shown = visibleItems(form, state.values);
  const values: Record<string, ProductSubmitValue> = {};
  const contacts: ContactValuesV2 = {};
  for (const item of shown) {
    if (item.kind === "contact") {
      const text = textOf(state.contacts[item.key]).trim();
      if (text !== "") contacts[item.key] = text;
      continue;
    }
    const read = SUBMIT_VALUE_BY_TYPE[item.type];
    if (read !== null) values[item.id] = read(state.values[item.id]);
  }
  return {
    productId,
    values,
    contacts: { ...contacts, consent: true },
    files: {},
  };
}

/** Ссылка кнопки ответа: свой путь (`/…`, но не `//…`) или `https://`. Остальное — `null`. */
export function safeLink(url: unknown): string | null {
  if (typeof url !== "string" || UNSAFE_LINK_CHARS.test(url)) return null;
  const ownPath = url.startsWith("/") && !url.startsWith("//");
  return ownPath || url.startsWith("https://") ? url : null;
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
  [200, successOutcome],
  [400, invalidOutcome],
  [422, refusedOutcome],
]);

/** Что значит ответ функции отправки; незнакомый статус — общий сбой. */
export function classifyResponse(status: number, body: unknown): SubmitOutcome {
  const read = OUTCOME_BY_STATUS.get(status);
  return read === undefined ? FAILED : read(body);
}

/* ── Разметка (строки; всё от расширения экранируется) ── */

/** Подсказка у плитки файла: форматы, лимит из FILE_LIMITS, сколько файлов. */
export function uploadHint(
  type: UploadType,
  maxFiles: number | undefined,
): string {
  return `${UPLOAD_FORMATS[type]} до ${FILE_LIMITS[type].maxMb} МБ · до ${maxFiles ?? 1}`;
}

interface FieldView {
  field: FieldItem;
  value: unknown;
  error: string | undefined;
  bad: boolean;
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
  return `<input class="${inputClass(view)}" type="${type}"${extra}${id}${attribute("value", textOf(view.value))}>`;
}

function selectHtml(view: FieldView): string {
  const choices = (view.field.options ?? []).map(
    (option) =>
      `<option value="${escapeHtml(option)}"${option === view.value ? " selected" : ""}>${escapeHtml(option)}</option>`,
  );
  const head = `<option value="">${TEXTS.choose}</option>`;
  return `<select class="${inputClass(view)}"${attribute("data-xp-field", view.field.id)}>${head}${choices.join("")}</select>`;
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

/** Плитка выбора файла. Загрузка — задача 5.2: пока выбор файла ничего не делает. */
function uploadHtml(type: UploadType) {
  return (view: FieldView): string => {
    const tile = view.bad ? "sf-up bad" : "sf-up";
    const accept = attribute("accept", FILE_LIMITS[type].accept.join(","));
    const multiple = (view.field.maxFiles ?? 1) > 1 ? " multiple" : "";
    const input = `<input type="file"${attribute("data-xp-file", view.field.id)}${accept}${multiple}>`;
    const hint = escapeHtml(uploadHint(type, view.field.maxFiles));
    const caption = `<span><b>${UPLOAD_TITLES[type]}</b><small>${hint}</small></span>`;
    const icon = `<span class="ic" aria-hidden="true">${UPLOAD_ICONS[type]}</span>`;
    return fieldHtml(
      view,
      `<label class="${tile}">${input}${icon}${caption}</label>`,
    );
  };
}

type FieldRenderer = (view: FieldView) => string;

const FIELD_RENDERERS: Record<FieldType, FieldRenderer> = {
  text: (view) => fieldHtml(view, inputHtml(view, "text")),
  textarea: (view) =>
    fieldHtml(
      view,
      `<textarea class="${inputClass(view)}"${attribute("data-xp-field", view.field.id)}>${escapeHtml(textOf(view.value))}</textarea>`,
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

function contactHtml(item: ContactItem, state: FormState): string {
  const input = CONTACT_INPUTS[item.key];
  const error = state.errors.items[item.id];
  const bad = hasOwn(state.errors.items, item.id);
  const placeholder =
    input.placeholder === "" ? "" : attribute("placeholder", input.placeholder);
  const control =
    `<input class="${bad ? "sf-in bad" : "sf-in"}" type="${input.type}"` +
    `${attribute("data-xp-contact", item.key)}${attribute("value", textOf(state.contacts[item.key]))}${placeholder} autocomplete="off">`;
  return `<div class="sf-f">${labelHtml(item.title, item.required)}${control}${errorHtml(error)}</div>`;
}

function itemHtml(item: FormItem, state: FormState): string {
  if (item.kind === "contact") return contactHtml(item, state);
  const view: FieldView = {
    field: item,
    value: state.values[item.id],
    error: state.errors.items[item.id],
    bad: hasOwn(state.errors.items, item.id),
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

/* ── Сеть ── */

interface FunctionReply {
  status: number;
  body: unknown;
}

function readCustomerToken(): string {
  try {
    return window.localStorage.getItem(CUSTOMER_TOKEN_KEY) ?? "";
  } catch {
    // Хранилище закрыто (приватный режим): покупаем как гость.
    return "";
  }
}

const readJson = (response: Response): Promise<unknown> =>
  response.json().catch(() => null);

function functionHeaders(): Record<string, string> {
  const token = readCustomerToken();
  const json = { "Content-Type": "application/json" };
  return token === "" ? json : { ...json, Authorization: `Bearer ${token}` };
}

/** Карта расширений: публичная, без кук. Сбой сети — `null`: форма не показывается. */
async function fetchStorefrontMap(
  options: MountExtensionPurchaseOptions,
): Promise<unknown> {
  const url = `${options.apiBase}/store/extensions/storefront?store_id=${encodeURIComponent(options.storeId)}`;
  try {
    const response = await fetch(url, { credentials: "omit" });
    return response.ok ? await readJson(response) : null;
  } catch {
    // Сеть недоступна: страница работает как без формы.
    return null;
  }
}

/** Вызов функции расширения; `null` — до сервера не дошли (сеть). */
async function callFunction(
  options: MountExtensionPurchaseOptions,
  point: { extensionId: string; name: string },
  input: object,
): Promise<FunctionReply | null> {
  const path = `${encodeURIComponent(point.extensionId)}/fn/${encodeURIComponent(point.name)}`;
  const url = `${options.apiBase}/store/extensions/${path}?store_id=${encodeURIComponent(options.storeId)}`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: functionHeaders(),
      credentials: "include",
      body: JSON.stringify(input),
    });
    return { status: response.status, body: await readJson(response) };
  } catch {
    // Сеть недоступна: вызывающий решает — молчать (показ) или сказать покупателю (отправка).
    return null;
  }
}

/* ── DOM: показ формы и события ── */

function scrollToFirstProblem(container: HTMLElement): void {
  const target = container.querySelector(".bad, .err");
  if (target !== null && typeof target.scrollIntoView === "function") {
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function revealForm(
  root: ParentNode,
  container: HTMLElement,
  view: ProductFormView,
): void {
  const actions = root.querySelector<HTMLElement>(ACTIONS_SELECTOR);
  if (actions !== null) {
    // hidden и display:none: у кнопок тем есть flex-классы, они перебивают [hidden].
    actions.hidden = true;
    actions.style.display = "none";
  }
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
}

const paint = (session: Session): void => {
  session.container.innerHTML = renderFormHtml(session.view, session.state);
};

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
  if (!isFormControl(event.target)) return;
  if (writeControl(session, event.target) !== null) paint(session);
}

function chooseSegment(session: Session, button: HTMLElement): void {
  const { xpField, xpValue } = button.dataset;
  if (xpField === undefined || xpValue === undefined) return;
  session.state.values[xpField] = xpValue;
  paint(session);
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

async function submit(session: Session): Promise<void> {
  const { state, view, point, options, container } = session;
  if (state.busy) return;
  const errors = validateV2(view.form, state.values, state.contacts);
  state.errors = errors;
  state.notice = "";
  if (hasErrors(errors)) {
    paint(session);
    scrollToFirstProblem(container);
    return;
  }
  state.busy = true;
  paint(session);
  const input = collectSubmitInput(options.productId, view.form, state);
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
  if (reply === null || reply.status !== 200) return null;
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
  const state: FormState = {
    values: {},
    contacts: {},
    errors: { items: {} },
    notice: "",
    busy: false,
  };
  const session: Session = {
    container,
    view: loaded.view,
    point: loaded.point,
    options,
    state,
  };
  revealForm(root, container, loaded.view);
  paint(session);
  container.addEventListener("input", (event) => onInput(session, event));
  container.addEventListener("change", (event) => onChange(session, event));
  container.addEventListener("click", (event) => onClick(session, event));
}

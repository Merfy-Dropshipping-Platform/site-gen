import type { FieldType } from "./types.js";
import type {
  ContactItem,
  ContactKey,
  FieldItem,
  FormItem,
  FormV2,
} from "./types-v2.js";
import {
  isIsoDate,
  isoTodayPlus,
  maxFilesText,
  numberRangeText,
  ruDate,
  toNumberOrUndefined,
  toStringValue,
} from "./value-checks.js";

/**
 * Проверка формы 2.0 с текстами PM (карточка 1.2, прототип submit): ошибки
 * совпадают слово в слово на превью конструктора, сайте и сервере расширения.
 * Правила — данными: «тип пункта → проверка → ключ текста», без цепочек if.
 * Тексты PM лежат в MESSAGES_V2, расширение может передать свои. Чего у PM нет
 * (длина, числа, даты, количество файлов) — текстами v1 из value-checks.
 * Скрытые пункты (visible: false или невыполненное условие) не проверяются
 * вовсе, даже обязательные.
 */

export interface ContactValuesV2 {
  name?: string;
  email?: string;
  phone?: string;
  social?: string;
  consent?: boolean;
}

/** Ошибки по id пункта: поля и контакты — одним списком, как в форме. consent — отдельно: это не пункт. */
export interface ValidationErrorsV2 {
  items: Record<string, string>;
  consent?: string;
}

/** Тексты PM — данные по умолчанию; validateV2 может получить свои тем же ключом. */
export const MESSAGES_V2 = {
  fileRequired: "Приложите хотя бы один файл",
  checkboxRequired: "Отметьте, чтобы продолжить",
  optionRequired: "Выберите вариант",
  textRequired: "Заполните поле",
  nameRequired: "Как к вам обращаться?",
  emailInvalid: "Проверьте почту",
  phoneRequired: "Нужен телефон",
  socialRequired: "Укажите ник или ссылку",
  consentRequired: "Без согласия заявку не отправить",
};

type MessageKey = keyof typeof MESSAGES_V2;
type Messages = Record<MessageKey, string>;

const messagesOf = (overrides: Partial<typeof MESSAGES_V2> = {}): Messages => ({
  ...MESSAGES_V2,
  ...overrides,
});

/** Почта по правилу PM: без пробелов и ровно один «собачий» знак. */
const EMAIL_V2_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_MIN_DIGITS = 10;

const isBlank = (value: unknown): boolean => toStringValue(value).trim() === "";
const digitsOf = (value: unknown): number =>
  toStringValue(value).replace(/\D/g, "").length;

/** Пункты, которые видит покупатель: visible = true и условие показа (если есть) выполнено. */
export function visibleItems(
  form: FormV2,
  values: Record<string, unknown>,
): FormItem[] {
  const shown = (item: FormItem): boolean =>
    item.kind === "contact" ||
    item.condition === undefined ||
    values[item.condition.field] === item.condition.equals;
  return form.items.filter((item) => item.visible && shown(item));
}

type FieldContext = {
  field: FieldItem;
  value: unknown;
  fileCount: number;
  messages: Messages;
};

/** Обязательное и пустое — как понимает «пусто» тип пункта. */
const EMPTY_BY_TYPE: Record<FieldType, (ctx: FieldContext) => boolean> = {
  photo: (ctx) => ctx.fileCount === 0,
  video: (ctx) => ctx.fileCount === 0,
  file: (ctx) => ctx.fileCount === 0,
  checkbox: (ctx) => ctx.value !== true,
  select: (ctx) => isBlank(ctx.value),
  buttons: (ctx) => isBlank(ctx.value),
  text: (ctx) => isBlank(ctx.value),
  textarea: (ctx) => isBlank(ctx.value),
  date: (ctx) => isBlank(ctx.value),
  number: (ctx) => isBlank(ctx.value),
};

/** Строка таблицы PM для типа пункта. */
const REQUIRED_KEY: Record<FieldType, MessageKey> = {
  photo: "fileRequired",
  video: "fileRequired",
  file: "fileRequired",
  checkbox: "checkboxRequired",
  select: "optionRequired",
  buttons: "optionRequired",
  text: "textRequired",
  textarea: "textRequired",
  date: "textRequired",
  number: "textRequired",
};

function outOfRange(value: number | undefined, field: FieldItem): boolean {
  if (value === undefined || Number.isNaN(value)) return false;
  if (field.min !== undefined && value < field.min) return true;
  return field.max !== undefined && value > field.max;
}

function beforeMinDays(ctx: FieldContext): boolean {
  const text = toStringValue(ctx.value);
  if (ctx.field.minDays === undefined || !isIsoDate(text)) return false;
  return text < isoTodayPlus(ctx.field.minDays);
}

/** Проверки v1: работают и у заполненного необязательного пункта, тексты v1. */
const VALUE_RULES: readonly {
  types: readonly FieldType[];
  broken: (ctx: FieldContext) => boolean;
  text: (ctx: FieldContext) => string;
}[] = [
  {
    types: ["text", "textarea"],
    broken: (ctx) =>
      ctx.field.maxLength !== undefined &&
      toStringValue(ctx.value).length > ctx.field.maxLength,
    text: (ctx) => `До ${ctx.field.maxLength} символов`,
  },
  {
    types: ["number"],
    broken: (ctx) => outOfRange(toNumberOrUndefined(ctx.value), ctx.field),
    text: (ctx) => numberRangeText(ctx.field),
  },
  {
    types: ["date"],
    broken: beforeMinDays,
    text: (ctx) =>
      `Не раньше чем ${ruDate(isoTodayPlus(ctx.field.minDays ?? 0))}`,
  },
  {
    types: ["photo", "video", "file"],
    broken: (ctx) =>
      ctx.field.maxFiles !== undefined && ctx.fileCount > ctx.field.maxFiles,
    text: (ctx) => maxFilesText(ctx.field),
  },
];

function fieldError(ctx: FieldContext): string | undefined {
  if (ctx.field.required && EMPTY_BY_TYPE[ctx.field.type](ctx)) {
    return ctx.messages[REQUIRED_KEY[ctx.field.type]];
  }
  const rule = VALUE_RULES.find(
    (candidate) =>
      candidate.types.includes(ctx.field.type) && candidate.broken(ctx),
  );
  if (rule === undefined) return undefined;
  return rule.text(ctx);
}

type ContactContext = {
  item: ContactItem;
  value: unknown;
  messages: Messages;
};

/** Почта закреплена (schema-v2) и проверяется всегда; остальные — когда видны и обязательны. */
const CONTACT_RULES: Record<
  ContactKey,
  { always: boolean; broken: (ctx: ContactContext) => boolean; key: MessageKey }
> = {
  name: {
    always: false,
    broken: (ctx) => isBlank(ctx.value),
    key: "nameRequired",
  },
  email: {
    always: true,
    broken: (ctx) => !EMAIL_V2_RE.test(toStringValue(ctx.value).trim()),
    key: "emailInvalid",
  },
  phone: {
    always: false,
    broken: (ctx) => digitsOf(ctx.value) < PHONE_MIN_DIGITS,
    key: "phoneRequired",
  },
  social: {
    always: false,
    broken: (ctx) => isBlank(ctx.value),
    key: "socialRequired",
  },
};

function contactError(ctx: ContactContext): string | undefined {
  const rule = CONTACT_RULES[ctx.item.key];
  const checked = rule.always || (ctx.item.visible && ctx.item.required);
  return checked && rule.broken(ctx) ? ctx.messages[rule.key] : undefined;
}

export function validateV2(
  form: FormV2,
  values: Record<string, unknown>,
  contacts: ContactValuesV2,
  filesCounts: Record<string, number> = {},
  messages: Partial<typeof MESSAGES_V2> = {},
): ValidationErrorsV2 {
  const texts = messagesOf(messages);
  const items: Record<string, string> = {};
  for (const item of visibleItems(form, values)) {
    const error =
      item.kind === "field"
        ? fieldError({
            field: item,
            value: values[item.id],
            fileCount: filesCounts[item.id] ?? 0,
            messages: texts,
          })
        : contactError({ item, value: contacts[item.key], messages: texts });
    if (error !== undefined) items[item.id] = error;
  }
  return {
    items,
    consent: contacts.consent === true ? undefined : texts.consentRequired,
  };
}

export function hasErrors(errors: ValidationErrorsV2): boolean {
  return Object.keys(errors.items).length > 0 || errors.consent !== undefined;
}

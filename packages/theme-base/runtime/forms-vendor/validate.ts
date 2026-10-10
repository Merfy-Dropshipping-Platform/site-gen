import { z } from "zod/v4";
import type {
  ContactValues,
  FieldDescriptor,
  FormDescriptor,
  ValidationErrors,
} from "./types.js";
import { visibleFields } from "./visible.js";
import { EMAIL_RE, fieldSchema, toStringValue } from "./value-checks.js";

/**
 * Единая валидация формы для трёх потребителей: превью в конструкторе
 * (MerfyFrontend), витрины (темы sites) и сервера (orders). Схема значений
 * собирается динамически из дескриптора на zod и прогоняется через safeParse;
 * собственных алгоритмов проверки здесь нет — только тексты ошибок мокапа и
 * условие видимости.
 *
 * Проверяются ТОЛЬКО видимые поля (visibleFields): значения скрытых условных
 * полей игнорируются. Файлы в значения не входят — витрина передаёт их
 * количество в filesCounts (id поля → число загруженных файлов).
 */

function isMedia(field: FieldDescriptor): boolean {
  return (
    field.type === "photo" || field.type === "video" || field.type === "file"
  );
}

/** Схема контактов: имя и почта всегда, телефон при phone='req', согласие всегда. */
function contactsSchema(descriptor: FormDescriptor): z.ZodType {
  return z.object({
    name: z.preprocess(
      toStringValue,
      z.string().trim().min(1, { error: "Как к вам обращаться?" }),
    ),
    email: z.preprocess(
      toStringValue,
      z
        .string()
        .trim()
        .regex(EMAIL_RE, { error: "Нужна почта: сюда придёт ответ магазина" }),
    ),
    phone:
      descriptor.phone === "req"
        ? z.preprocess(
            toStringValue,
            z.string().trim().min(1, { error: "Нужен телефон" }),
          )
        : // phone='opt'/'off': телефон не проверяется; .optional() нужен, чтобы
          // отсутствующий ключ контакта не ронял объект (zod v4).
          z.unknown().optional(),
    consent: z.unknown().refine((v) => v === true, {
      error: "Без согласия магазин не сможет принять заявку",
    }),
  });
}

/** issues → {ключ: текст}; на поле берётся первый попавшийся issue. */
function collectErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".");
    if (key !== "" && !(key in out)) out[key] = issue.message;
  }
  return out;
}

export function validate(
  descriptor: FormDescriptor,
  values: Record<string, unknown>,
  contacts: ContactValues,
  filesCounts?: Record<string, number>,
): ValidationErrors {
  const shape: Record<string, z.ZodType> = {};
  const input: Record<string, unknown> = {};
  for (const field of visibleFields(descriptor, values)) {
    const count = filesCounts?.[field.id] ?? 0;
    shape[field.id] = fieldSchema(field, count);
    input[field.id] = isMedia(field) ? count : values[field.id];
  }

  const fields: Record<string, string> = {};
  const fieldsResult = z.object(shape).safeParse(input);
  if (!fieldsResult.success) {
    Object.assign(fields, collectErrors(fieldsResult.error));
  }

  const contactsResult = contactsSchema(descriptor).safeParse(contacts);
  const contactErrors = contactsResult.success
    ? {}
    : collectErrors(contactsResult.error);

  return {
    fields,
    contacts: {
      name: contactErrors["name"],
      email: contactErrors["email"],
      phone: contactErrors["phone"],
      consent: contactErrors["consent"],
    },
  };
}

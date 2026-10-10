/**
 * Публичный вход @merfy/forms: типы дескриптора, схема дескриптора
 * (formDescriptorSchema), видимость и контакты (visibleFields, contactsOf),
 * единая валидация (validate) и лимиты файлов (FILE_LIMITS). Потребители:
 * orders (сервер), MerfyFrontend (конструктор и превью), темы sites (витрина).
 * Форма 2.0 (спека 120): FormV2, formV2Schema и validateV2 с текстами PM
 * (MESSAGES_V2) — рядом с v1, v1 не меняется. Перевод v1 → 2.0 — fromV1.
 */
export { FILE_LIMITS } from "./file-limits.js";
export { formDescriptorSchema } from "./schema.js";
export { formV2Schema } from "./schema-v2.js";
export { fromV1 } from "./from-v1.js";
export type { FromV1Issue, FromV1Result } from "./from-v1.js";
export { contactsOf, visibleFields } from "./visible.js";
export { validate } from "./validate.js";
export {
  MESSAGES_V2,
  hasErrors,
  validateV2,
  visibleItems,
} from "./validate-v2.js";
export { CONTACT_KEYS } from "./types-v2.js";
export type {
  ContactValues,
  FieldDescriptor,
  FieldType,
  FormDescriptor,
  PhoneMode,
  ValidationErrors,
} from "./types.js";
export type {
  ContactItem,
  ContactKey,
  FieldItem,
  FormItem,
  FormV2,
} from "./types-v2.js";
export type { ContactValuesV2, ValidationErrorsV2 } from "./validate-v2.js";

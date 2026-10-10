import { formDescriptorSchema } from "./schema.js";
import { formV2Schema } from "./schema-v2.js";
import type { FieldDescriptor, FormDescriptor, PhoneMode } from "./types.js";
import {
  CONTACT_KEYS,
  type ContactItem,
  type ContactKey,
  type FieldItem,
  type FormV2,
} from "./types-v2.js";

/**
 * Перевод формы v1 в форму 2.0 (спека 120 §4.2, карточка 1.3). Чистая функция: вход — данные из базы (unknown),
 * выход — форма 2.0 или список проблем. Ничего не чинит молча. button и doneMessage в форму 2.0 не входят.
 */

export interface FromV1Issue {
  /** "v1" — вход не прошёл formDescriptorSchema, "v2" — результат не прошёл formV2Schema. */
  stage: "v1" | "v2";
  path: (string | number)[];
  message: string;
}

export type FromV1Result =
  { ok: true; form: FormV2 } | { ok: false; issues: FromV1Issue[] };

const CONTACT_TITLES: Record<ContactKey, string> = {
  name: "Имя",
  email: "Почта",
  phone: "Телефон",
  social: "Соцсеть или Telegram",
};

const PHONE: Record<PhoneMode, { visible: boolean; required: boolean }> = {
  req: { visible: true, required: true },
  opt: { visible: true, required: false },
  off: { visible: false, required: false },
};

const OPTIONAL_FIELD_KEYS = [
  "hint",
  "options",
  "maxLength",
  "minDays",
  "min",
  "max",
  "maxFiles",
  "condition",
] as const;

/** Видимость и обязательность контакта в v1 — данными, без if. */
function contactFlags(key: ContactKey, phone: PhoneMode) {
  const flags: Record<ContactKey, { visible: boolean; required: boolean }> = {
    name: { visible: true, required: true },
    email: { visible: true, required: true },
    phone: PHONE[phone],
    social: { visible: false, required: false },
  };
  return flags[key];
}

/** Копирует только те необязательные ключи, которые заданы: undefined в результат не попадает. */
function presentKeys<T extends object, K extends keyof T>(
  source: T,
  keys: readonly K[],
): Partial<Pick<T, K>> {
  const result: Partial<Pick<T, K>> = {};
  for (const key of keys) {
    if (source[key] !== undefined) result[key] = source[key];
  }
  return result;
}

function fieldItem(field: FieldDescriptor): FieldItem {
  return {
    id: field.id,
    kind: "field",
    type: field.type,
    title: field.label,
    visible: true,
    required: field.required ?? false,
    ...presentKeys(field, OPTIONAL_FIELD_KEYS),
  };
}

/** Первый свободный id: base, иначе base-2, base-3, … */
function freeId(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function contactItems(v1: FormDescriptor): ContactItem[] {
  const taken = new Set(v1.fields.map((field) => field.id));
  return CONTACT_KEYS.map((key): ContactItem => {
    const id = freeId(`c-${key}`, taken);
    taken.add(id);
    return {
      id,
      kind: "contact",
      key,
      title: CONTACT_TITLES[key],
      ...contactFlags(key, v1.phone),
    };
  });
}

function pathSegment(segment: PropertyKey): string | number {
  return typeof segment === "symbol" ? String(segment) : segment;
}

export function fromV1(input: unknown): FromV1Result {
  const parsedV1 = formDescriptorSchema.safeParse(input);
  if (!parsedV1.success) {
    return {
      ok: false,
      issues: parsedV1.error.issues.map((issue) => ({
        stage: "v1",
        path: issue.path.map(pathSegment),
        message: issue.message,
      })),
    };
  }
  const v1 = parsedV1.data;
  const parsedV2 = formV2Schema.safeParse({
    version: 2,
    items: [...v1.fields.map(fieldItem), ...contactItems(v1)],
  });
  if (!parsedV2.success) {
    return {
      ok: false,
      issues: parsedV2.error.issues.map((issue) => ({
        stage: "v2",
        path: issue.path.map(pathSegment),
        message: issue.message,
      })),
    };
  }
  return { ok: true, form: parsedV2.data };
}

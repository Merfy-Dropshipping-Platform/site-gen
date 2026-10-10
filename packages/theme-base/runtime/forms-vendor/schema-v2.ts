import { z } from "zod/v4";
import type { FieldType } from "./types.js";
import {
  CONTACT_KEYS,
  type ContactItem,
  type FieldItem,
  type FormItem,
  type FormV2,
} from "./types-v2.js";

/**
 * Схема формы 2.0. Форма закрыта: ровно объявленные ключи. Правила между ключами — данными в FIELD_RULES и
 * CONDITION_RULES, без цепочек if: каждое правило — «когда сломано» и «что сказать».
 */

const FIELD_TYPES = [
  "text",
  "textarea",
  "select",
  "buttons",
  "checkbox",
  "date",
  "number",
  "photo",
  "video",
  "file",
] as const satisfies readonly FieldType[];

const WITH_OPTIONS: ReadonlySet<FieldType> = new Set<FieldType>([
  "select",
  "buttons",
]);
const WITH_LENGTH: ReadonlySet<FieldType> = new Set<FieldType>([
  "text",
  "textarea",
]);
const MEDIA: ReadonlySet<FieldType> = new Set<FieldType>([
  "photo",
  "video",
  "file",
]);
const MAX_ITEMS = 60;

const fieldItemSchema = z.strictObject({
  id: z.string().min(1).max(100),
  kind: z.literal("field"),
  type: z.enum(FIELD_TYPES),
  title: z.string().min(1).max(200),
  visible: z.boolean(),
  required: z.boolean(),
  hint: z.string().max(500).optional(),
  options: z.array(z.string().min(1).max(200)).optional(),
  maxLength: z.number().int().min(1).max(5000).optional(),
  minDays: z.number().int().min(0).max(365).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  maxFiles: z.number().int().min(1).max(500).optional(),
  condition: z
    .strictObject({
      field: z.string().min(1).max(100),
      equals: z.string().min(1).max(200),
    })
    .optional(),
});

const contactItemSchema = z.strictObject({
  id: z.string().min(1).max(100),
  kind: z.literal("contact"),
  key: z.enum(CONTACT_KEYS),
  title: z.string().min(1).max(200),
  visible: z.boolean(),
  required: z.boolean(),
});

const itemSchema = z.discriminatedUnion("kind", [
  fieldItemSchema,
  contactItemSchema,
]);

type Issue = { path: (string | number)[]; message: string };

type FieldRule = {
  key: keyof FieldItem;
  broken: (field: FieldItem) => boolean;
  message: (field: FieldItem) => string;
};

const FIELD_RULES: FieldRule[] = [
  {
    key: "options",
    broken: (f) => WITH_OPTIONS.has(f.type) && (f.options ?? []).length === 0,
    message: (f) => `типу ${f.type} нужен непустой список вариантов`,
  },
  {
    key: "options",
    broken: (f) => !WITH_OPTIONS.has(f.type) && f.options !== undefined,
    message: () => "варианты бывают только у select и buttons",
  },
  {
    key: "maxLength",
    broken: (f) => !WITH_LENGTH.has(f.type) && f.maxLength !== undefined,
    message: () => "maxLength — только у text и textarea",
  },
  {
    key: "minDays",
    broken: (f) => f.type !== "date" && f.minDays !== undefined,
    message: () => "minDays — только у date",
  },
  {
    key: "min",
    broken: (f) => f.type !== "number" && f.min !== undefined,
    message: () => "min — только у number",
  },
  {
    key: "max",
    broken: (f) => f.type !== "number" && f.max !== undefined,
    message: () => "max — только у number",
  },
  {
    key: "min",
    broken: (f) => f.min !== undefined && f.max !== undefined && f.min > f.max,
    message: () => "min не может быть больше max",
  },
  {
    key: "maxFiles",
    broken: (f) => !MEDIA.has(f.type) && f.maxFiles !== undefined,
    message: () => "maxFiles — только у photo, video и file",
  },
];

type Conditioned = FieldItem & {
  condition: NonNullable<FieldItem["condition"]>;
};

type ConditionRule = {
  broken: (field: Conditioned, target: FieldItem | undefined) => boolean;
  message: (field: Conditioned) => string;
};

const CONDITION_RULES: ConditionRule[] = [
  {
    broken: (f) => f.condition.field === f.id,
    message: () => "пункт не может зависеть от самого себя",
  },
  {
    broken: (_f, target) => target === undefined,
    message: (f) =>
      `условие ссылается на несуществующий пункт «${f.condition.field}»`,
  },
  {
    broken: (_f, target) =>
      target !== undefined && !WITH_OPTIONS.has(target.type),
    message: () =>
      "условие может ссылаться только на пункт с вариантами (select или buttons)",
  },
];

function isField(item: FormItem): item is FieldItem {
  return item.kind === "field";
}

function isContact(item: FormItem): item is ContactItem {
  return item.kind === "contact";
}

function hasCondition(item: FormItem): item is Conditioned {
  return isField(item) && item.condition !== undefined;
}

function duplicateIdIssues(items: FormItem[]): Issue[] {
  const firstIndex = new Map<string, number>();
  items.forEach((item, i) =>
    firstIndex.set(item.id, firstIndex.get(item.id) ?? i),
  );
  return items.flatMap((item, i) => {
    if (firstIndex.get(item.id) === i) return [];
    return [
      {
        path: ["items", i, "id"],
        message: `Два пункта с id «${item.id}» — id должны быть уникальны`,
      },
    ];
  });
}

function contactCountIssues(items: FormItem[]): Issue[] {
  const contacts = items.filter(isContact);
  return CONTACT_KEYS.flatMap((key) => {
    const count = contacts.filter((contact) => contact.key === key).length;
    if (count === 1) return [];
    return [
      {
        path: ["items"],
        message: `Контакт «${key}» должен быть в форме ровно один раз, сейчас ${count}`,
      },
    ];
  });
}

function lockedEmailIssues(items: FormItem[]): Issue[] {
  return items.flatMap((item, i) => {
    if (!isContact(item) || item.key !== "email") return [];
    if (item.visible && item.required) return [];
    return [
      {
        path: ["items", i],
        message: "Почту нельзя скрыть и нельзя сделать необязательной",
      },
    ];
  });
}

function fieldIssues(items: FormItem[]): Issue[] {
  return items.flatMap((item, i) => {
    if (!isField(item)) return [];
    return FIELD_RULES.filter((rule) => rule.broken(item)).map((rule) => ({
      path: ["items", i, rule.key],
      message: `Пункт «${item.title}»: ${rule.message(item)}`,
    }));
  });
}

function conditionIssues(items: FormItem[]): Issue[] {
  const fields = new Map(
    items.filter(isField).map((field) => [field.id, field]),
  );
  return items.flatMap((item, i) => {
    if (!hasCondition(item)) return [];
    const rule = CONDITION_RULES.find((candidate) =>
      candidate.broken(item, fields.get(item.condition.field)),
    );
    if (!rule) return [];
    return [
      {
        path: ["items", i, "condition"],
        message: `Пункт «${item.title}»: ${rule.message(item)}`,
      },
    ];
  });
}

const FORM_CHECKS = [
  duplicateIdIssues,
  contactCountIssues,
  lockedEmailIssues,
  fieldIssues,
  conditionIssues,
];

export const formV2Schema: z.ZodType<FormV2> = z
  .strictObject({
    version: z.literal(2),
    items: z.array(itemSchema).min(1).max(MAX_ITEMS),
  })
  .superRefine((form, ctx) => {
    FORM_CHECKS.flatMap((check) => check(form.items)).forEach((issue) =>
      ctx.addIssue({
        code: "custom",
        path: issue.path,
        message: issue.message,
      }),
    );
  });

import { z } from "zod/v4";
import type { FieldDescriptor, FieldType, FormDescriptor } from "./types.js";

/**
 * Схема дескриптора формы — ей orders проверяет дескриптор при сохранении
 * мерчантом (конструктор админки отдаёт сюда json). Форма закрыта: ровно
 * объявленные поля и типы, никаких лишних ключей; кросс-правила (options для
 * select/buttons, ссылки condition, уникальность id) — в superRefine.
 */
const fieldTypeSchema = z.enum([
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
] satisfies [FieldType, ...FieldType[]]);

const phoneModeSchema = z.enum(["req", "opt", "off"]);

const conditionSchema = z.strictObject({
  field: z.string().min(1).max(100),
  equals: z.string().min(1).max(200),
});

const fieldDescriptorSchema = z.strictObject({
  id: z.string().min(1).max(100),
  type: fieldTypeSchema,
  label: z.string().min(1).max(200),
  hint: z.string().max(500).optional(),
  required: z.boolean().optional(),
  options: z.array(z.string().min(1).max(200)).optional(),
  maxLength: z.number().int().min(1).max(5000).optional(),
  minDays: z.number().int().min(0).max(365).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  maxFiles: z.number().int().min(1).max(500).optional(),
  condition: conditionSchema.optional(),
});

function withOptions(field: FieldDescriptor): boolean {
  return field.type === "select" || field.type === "buttons";
}

function isMedia(field: FieldDescriptor): boolean {
  return (
    field.type === "photo" || field.type === "video" || field.type === "file"
  );
}

export const formDescriptorSchema: z.ZodType<FormDescriptor> = z
  .strictObject({
    fields: z.array(fieldDescriptorSchema),
    phone: phoneModeSchema,
    button: z.string().min(1).max(200),
    doneMessage: z.string().min(1).max(500),
  })
  .superRefine((form, ctx) => {
    // Уникальность id: на них ссылаются condition и отправленные ответы.
    const byId = new Map<string, FieldDescriptor>();
    form.fields.forEach((field, i) => {
      if (byId.has(field.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["fields", i, "id"],
          message: `Два поля с id «${field.id}» — id должны быть уникальны`,
        });
      } else {
        byId.set(field.id, field);
      }
    });

    form.fields.forEach((field, i) => {
      const what = `Поле «${field.label}»`;

      if (
        withOptions(field) &&
        (!field.options || field.options.length === 0)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["fields", i, "options"],
          message: `${what}: типу ${field.type} нужен непустой список options`,
        });
      }
      if (!withOptions(field) && field.options !== undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["fields", i, "options"],
          message: `${what}: options допустимы только для полей select и buttons`,
        });
      }
      if (
        field.type !== "text" &&
        field.type !== "textarea" &&
        field.maxLength !== undefined
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["fields", i, "maxLength"],
          message: `${what}: maxLength допустим только для полей text и textarea`,
        });
      }
      if (field.type !== "date" && field.minDays !== undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["fields", i, "minDays"],
          message: `${what}: minDays допустим только для полей date`,
        });
      }
      if (field.type !== "number") {
        if (field.min !== undefined) {
          ctx.addIssue({
            code: "custom",
            path: ["fields", i, "min"],
            message: `${what}: min допустим только для полей number`,
          });
        }
        if (field.max !== undefined) {
          ctx.addIssue({
            code: "custom",
            path: ["fields", i, "max"],
            message: `${what}: max допустим только для полей number`,
          });
        }
      } else if (
        field.min !== undefined &&
        field.max !== undefined &&
        field.min > field.max
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["fields", i, "min"],
          message: `${what}: min не может быть больше max`,
        });
      }
      if (!isMedia(field) && field.maxFiles !== undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["fields", i, "maxFiles"],
          message: `${what}: maxFiles допустим только для полей photo, video и file`,
        });
      }

      if (field.condition) {
        if (field.condition.field === field.id) {
          ctx.addIssue({
            code: "custom",
            path: ["fields", i, "condition"],
            message: `${what}: поле не может зависеть от самого себя`,
          });
        } else {
          const target = byId.get(field.condition.field);
          if (!target) {
            ctx.addIssue({
              code: "custom",
              path: ["fields", i, "condition", "field"],
              message: `${what}: condition ссылается на несуществующее поле «${field.condition.field}»`,
            });
          } else if (!withOptions(target)) {
            ctx.addIssue({
              code: "custom",
              path: ["fields", i, "condition", "field"],
              message: `${what}: condition может ссылаться только на поле с вариантами (select или buttons)`,
            });
          }
        }
      }
    });
  });

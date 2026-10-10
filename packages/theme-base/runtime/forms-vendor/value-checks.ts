import { z } from "zod/v4";
import type { FieldDescriptor, FieldType } from "./types.js";

/**
 * Проверки значений и тексты ошибок, общие для v1 (validate.ts) и v2
 * (validate-v2.ts): приведение значения к строке и к числу, календарная дата,
 * граница «не раньше чем» и тексты для длины, чисел и количества файлов.
 * Вынесены из validate.ts без изменения поведения.
 */

/** Регулярка почты v1: без пробелов, «собачий» знак и домен с точкой. */
export const EMAIL_RE = /^\S+@\S+\.\S+$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Обязательное файловое поле без файлов — тексты мокапа. */
const REQUIRED_FILE_TEXT: Record<"photo" | "video" | "file", string> = {
  photo: "Добавьте хотя бы одно фото",
  video: "Добавьте видео",
  file: "Добавьте файл",
};

/** Что нужно текстам проверок от пункта формы: v1 FieldDescriptor и v2 FieldItem подходят. */
export interface BoundedField {
  type: FieldType;
  min?: number;
  max?: number;
  maxFiles?: number;
}

/**
 * Значение приводится к строке как в прототипе (String(v)): примитивы —
 * своим представлением, null/undefined/объекты — пустая строка.
 */
export function toStringValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }
  return "";
}

/** Число: number или числовая строка; пустое отсутствию равняется, мусор — NaN. */
export function toNumberOrUndefined(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return Number.NaN;
}

/** Календарная дата YYYY-MM-DD (не 2026-13-45). */
export function isIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Сегодня (локальная дата) + days, в формате YYYY-MM-DD. */
export function isoTodayPlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Дата для человека: 31.12.2026. */
export function ruDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

export function numberRangeText(field: BoundedField): string {
  if (field.min !== undefined && field.max !== undefined) {
    return `От ${field.min} до ${field.max}`;
  }
  if (field.min !== undefined) return `Не меньше ${field.min}`;
  return `Не больше ${field.max}`;
}

export function maxFilesText(field: BoundedField): string {
  const n = field.maxFiles ?? 0;
  if (field.type === "photo") return `Не больше ${n} фото`;
  if (field.type === "video") return `Не больше ${n} видео`;
  return `Не больше ${n} ${n === 1 ? "файла" : "файлов"}`;
}

/** Схема значения одного видимого поля (v1). */
export function fieldSchema(
  field: FieldDescriptor,
  fileCount: number,
): z.ZodType {
  switch (field.type) {
    case "text":
    case "textarea": {
      let s = z.string();
      if (field.maxLength !== undefined) {
        const max = field.maxLength;
        s = s.max(max, { error: `До ${max} символов` });
      }
      if (field.required) {
        s = s.trim().min(1, { error: "Заполните поле" });
      }
      return z.preprocess(toStringValue, s);
    }

    case "select":
    case "buttons": {
      let s = z.string();
      if (field.required) {
        s = s.min(1, { error: "Выберите вариант" });
      }
      const options = field.options ?? [];
      if (options.length > 0) {
        // Пустое значение допустимо у необязательного поля; выбранного варианта
        // вне списка прототип не показывает — сервер такое отсекает тем же текстом.
        s = s.refine((v) => v === "" || options.includes(v), {
          error: "Выберите вариант",
        });
      }
      return z.preprocess(toStringValue, s);
    }

    case "checkbox": {
      // Неотмеченный обязательный checkbox — ошибка; необязательный не проверяется.
      return z.unknown().refine((v) => !field.required || v === true, {
        error: "Отметьте, чтобы продолжить",
      });
    }

    case "date": {
      let s = z.string();
      if (field.required) {
        s = s.min(1, { error: "Заполните поле" });
      }
      s = s.refine((v) => v === "" || isIsoDate(v), {
        error: "Заполните поле",
      });
      if (field.minDays !== undefined) {
        const boundary = isoTodayPlus(field.minDays);
        s = s.refine((v) => !isIsoDate(v) || v >= boundary, {
          error: `Не раньше чем ${ruDate(boundary)}`,
        });
      }
      return z.preprocess(toStringValue, s);
    }

    case "number": {
      // zod v4 не принимает NaN в z.number — текст «Введите число» ставится
      // на саму проверку типа; мусор приводится к NaN в preprocess.
      let s: z.ZodType<number | undefined> = z
        .number({ error: "Введите число" })
        .optional();
      if (field.required) {
        s = s.refine((v) => v !== undefined, { error: "Заполните поле" });
      }
      if (field.min !== undefined) {
        const min = field.min;
        s = s.refine((v) => v === undefined || v >= min, {
          error: numberRangeText(field),
        });
      }
      if (field.max !== undefined) {
        const max = field.max;
        s = s.refine((v) => v === undefined || v <= max, {
          error: numberRangeText(field),
        });
      }
      return z.preprocess(toNumberOrUndefined, s);
    }

    case "photo":
    case "video":
    case "file": {
      // Значением файлового поля в схеме становится количество файлов.
      let s = z.number().int().min(0);
      if (field.required) {
        s = s.min(1, { error: REQUIRED_FILE_TEXT[field.type] });
      }
      if (field.maxFiles !== undefined) {
        s = s.max(field.maxFiles, { error: maxFilesText(field) });
      }
      return z.preprocess(() => fileCount, s);
    }
  }
}

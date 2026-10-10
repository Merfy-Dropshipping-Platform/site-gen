import type { FieldType } from "./types.js";

/**
 * Форма «Заявок 2.0» (спека 120 §4.2, документ PM): одна на магазин, поля и контакты — одним списком,
 * порядок items = порядок на сайте. Согласие на обработку данных — не пункт: оно есть в форме всегда.
 */

/** Контакты покупателя — такие же пункты: их двигают и прячут, но не удаляют. */
export const CONTACT_KEYS = ["name", "email", "phone", "social"] as const;
export type ContactKey = (typeof CONTACT_KEYS)[number];

export interface FieldItem {
  id: string;
  kind: "field";
  type: FieldType;
  title: string;
  /** Показывать в магазине. Скрытый пункт не попадает в отправленные ответы. */
  visible: boolean;
  required: boolean;
  hint?: string;
  /** Варианты для select и buttons, порядок важен. */
  options?: string[];
  maxLength?: number;
  minDays?: number;
  min?: number;
  max?: number;
  /** Сколько файлов можно приложить — для photo, video, file. */
  maxFiles?: number;
  /** Условие показа из v1. Конструктор 2.0 его не показывает (спека 120 §4.2), витрина понимает. */
  condition?: { field: string; equals: string };
}

export interface ContactItem {
  id: string;
  kind: "contact";
  key: ContactKey;
  title: string;
  /** У почты всегда true. */
  visible: boolean;
  /** У почты всегда true. */
  required: boolean;
}

export type FormItem = FieldItem | ContactItem;

export interface FormV2 {
  version: 2;
  items: FormItem[];
}

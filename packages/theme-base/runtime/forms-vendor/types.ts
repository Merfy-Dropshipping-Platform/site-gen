/**
 * Типы дескриптора динамической формы — контракт @merfy/forms (спека 118 §6).
 * Дескриптор — это данные: их собирает конструктор в админке, хранит orders
 * (jsonb в request_forms), по ним рендерится витрина и превью, по ним же
 * собирается zod-схема в validate.
 */

/** Тип поля — закрытый список, как в конструкторе форм админки. */
export type FieldType =
  | "text"
  | "textarea"
  | "select"
  | "buttons"
  | "checkbox"
  | "date"
  | "number"
  | "photo"
  | "video"
  | "file";

/** Описание одного поля формы. */
export interface FieldDescriptor {
  /** Идентификатор поля внутри формы (уникален, на него ссылаются condition и ответы). */
  id: string;
  /** Тип поля — определяет и рендер, и проверки validate. */
  type: FieldType;
  /** Название поля, которое видит покупатель. */
  label: string;
  /** Подсказка покупателю под названием поля. */
  hint?: string;
  /** Обязательное ли поле. Для checkbox — «отметьте, чтобы продолжить». */
  required?: boolean;
  /** Варианты выбора; обязателен и непуст для select и buttons. */
  options?: string[];
  /** Максимум символов для text и textarea: целое 1..5000. */
  maxLength?: number;
  /** Для date: дата не раньше чем через N дней от сегодня (целое 0..365). */
  minDays?: number;
  /** Для number: минимальное значение. */
  min?: number;
  /** Для number: максимальное значение. */
  max?: number;
  /** Для photo/video/file: сколько файлов можно приложить, целое 1..500. */
  maxFiles?: number;
  /** Условие показа: поле видно, только когда поле `field` равно `equals`. */
  condition?: { field: string; equals: string };
}

/** Режим телефона в контактах формы: обязательный / необязательный / не спрашивать. */
export type PhoneMode = "req" | "opt" | "off";

/** Дескриптор формы целиком — то, что сохраняет мерчант и получает покупатель. */
export interface FormDescriptor {
  fields: FieldDescriptor[];
  phone: PhoneMode;
  /** Текст кнопки отправки на сайте. */
  button: string;
  /** Сообщение после успешной отправки. */
  doneMessage: string;
}

/** Контактные данные покупателя: есть в каждой форме, идут после всех полей. */
export interface ContactValues {
  name?: string;
  email?: string;
  phone?: string;
  /** Согласие на обработку персональных данных — обязательно. */
  consent?: boolean;
}

/** Результат validate: тексты ошибок по id видимых полей и по ключам контактов. */
export interface ValidationErrors {
  fields: Record<string, string>;
  contacts: Record<"name" | "email" | "phone" | "consent", string | undefined>;
}

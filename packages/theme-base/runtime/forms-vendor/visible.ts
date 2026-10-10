import type { FieldDescriptor, FormDescriptor, PhoneMode } from "./types.js";

/**
 * Видимые при данных значениях поля формы: поле без condition видно всегда,
 * поле с condition — только когда значение поля, на которое оно ссылается,
 * строго равно equals (как в прототипе: vals[cond.f] === cond.v). Порядок
 * полей сохраняется. validate проверяет только видимые поля.
 */
export function visibleFields(
  descriptor: FormDescriptor,
  values: Record<string, unknown>,
): FieldDescriptor[] {
  return descriptor.fields.filter(
    (field) =>
      !field.condition ||
      values[field.condition.field] === field.condition.equals,
  );
}

/**
 * Какие контакты есть у формы: имя, почта и согласие — всегда (убрать нельзя:
 * без почты не дойдёт ответ, без согласия обращение нельзя принять), телефон —
 * по режиму дескриптора. Рендер и validate согласованы через эту функцию.
 */
export function contactsOf(descriptor: FormDescriptor): {
  name: true;
  email: true;
  phone: PhoneMode;
  consent: true;
} {
  return { name: true, email: true, phone: descriptor.phone, consent: true };
}
